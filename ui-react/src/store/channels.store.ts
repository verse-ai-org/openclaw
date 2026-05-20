import { create } from "zustand";
import {
  formatActivateFailure,
  isRuntimeChannelLoaded,
  waitForChannelRuntimeLoaded,
} from "@/lib/channel-lifecycle";
import {
  isWeixinLoginSuccessMessage,
  isWeixinWebLoginProviderReady,
  WEIXIN_CHANNEL_ID,
  WEIXIN_WEB_LOGIN_NOT_READY_MESSAGE,
} from "@/lib/channel-post-enable";
import type {
  ChannelCatalogEntry,
  ChannelsEnableResult,
  ChannelsStatusSnapshot,
  NostrProfile,
  NostrProfileFormState,
} from "@/types/channels";
import { useGatewayStore } from "./gateway.store";
import { usePluginsStore } from "./plugins.store";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isWeixinChannelConfigured(snapshot: ChannelsStatusSnapshot | null): boolean {
  const raw = snapshot?.channels[WEIXIN_CHANNEL_ID] as { configured?: boolean } | undefined;
  return Boolean(raw?.configured);
}

function createNostrProfileFormState(
  profile: NostrProfile | undefined | null,
): NostrProfileFormState {
  const values: NostrProfile = {
    name: profile?.name ?? "",
    displayName: profile?.displayName ?? "",
    about: profile?.about ?? "",
    picture: profile?.picture ?? "",
    banner: profile?.banner ?? "",
    website: profile?.website ?? "",
    nip05: profile?.nip05 ?? "",
    lud16: profile?.lud16 ?? "",
  };
  return {
    values,
    original: { ...values },
    saving: false,
    importing: false,
    error: null,
    success: null,
    fieldErrors: {},
    showAdvanced: Boolean(
      profile?.banner || profile?.website || profile?.nip05 || profile?.lud16,
    ),
  };
}

// ── State ─────────────────────────────────────────────────────────────────────

interface ChannelsState {
  // Status snapshot from Gateway
  snapshot: ChannelsStatusSnapshot | null;
  loading: boolean;
  lastError: string | null;
  lastSuccessAt: number | null;

  // Config form
  configSchema: unknown;
  configSchemaLoading: boolean;
  configForm: Record<string, unknown> | null;
  configRaw: string | null;
  configBaseHash: string | null;
  configUiHints: Record<string, unknown>;
  configSaving: boolean;
  configFormDirty: boolean;

  // WhatsApp specific
  whatsappQrDataUrl: string | null;
  whatsappMessage: string | null;
  whatsappBusy: boolean;

  // WeChat (openclaw-weixin) specific
  weixinQrDataUrl: string | null;
  weixinMessage: string | null;
  weixinBusy: boolean;
  weixinConnected: boolean;
  weixinSessionKey: string | null;
  weixinNeedsVerifyCode: boolean;
  weixinVerifyCode: string;

  // Nostr profile editing
  nostrProfileFormState: NostrProfileFormState | null;
  nostrProfileAccountId: string | null;

  // Actions
  fetchStatus: (probe: boolean) => Promise<void>;
  refreshPageData: (options?: { probe?: boolean; plugins?: boolean }) => Promise<void>;
  fetchConfigSchema: () => Promise<void>;
  fetchConfigForm: () => Promise<void>;
  patchConfig: (path: Array<string | number>, value: unknown) => void;
  saveConfig: () => Promise<boolean>;
  reloadConfig: () => Promise<void>;
  enableChannel: (channelId: string, enabled: boolean) => Promise<ChannelsEnableResult | null>;
  activateChannel: (channelId: string) => Promise<{ ok: boolean; reason?: string; timedOut?: boolean }>;
  waitForChannelRuntime: (channelId: string) => Promise<{ ok: boolean; timedOut: boolean }>;
  waitForWeixinWebLoginProvider: () => Promise<{ ok: boolean; reason?: string; timedOut?: boolean }>;
  togglingChannelId: string | null;
  toggleChannelError: Record<string, string>;
  startWhatsAppLogin: (force: boolean) => Promise<void>;
  waitForWhatsAppScan: () => Promise<void>;
  logoutWhatsApp: () => Promise<void>;
  startWeixinLogin: (force: boolean) => Promise<void>;
  waitForWeixinScan: () => Promise<void>;
  logoutWeixin: () => Promise<void>;
  editNostrProfile: (accountId: string, profile: NostrProfile | null) => void;
  cancelNostrProfile: () => void;
  updateNostrProfileField: (field: keyof NostrProfile, value: string) => void;
  saveNostrProfile: () => Promise<void>;
  importNostrProfile: () => Promise<void>;
  toggleNostrAdvanced: () => void;
  // Catalog (installable channels)
  catalog: ChannelCatalogEntry[] | null;
  catalogLoading: boolean;
  catalogError: string | null;
  fetchCatalog: () => Promise<void>;

  // Called by gateway event handler
  applySnapshot: (snapshot: ChannelsStatusSnapshot) => void;

  statusRefreshSeq: number;
  statusLoading: boolean;
  statusLoadingProbe: boolean | null;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useChannelsStore = create<ChannelsState>()((set, get) => ({
  snapshot: null,
  loading: false,
  lastError: null,
  lastSuccessAt: null,

  configSchema: null,
  configSchemaLoading: false,
  configForm: null,
  configRaw: null,
  configBaseHash: null,
  configUiHints: {},
  configSaving: false,
  configFormDirty: false,

  whatsappQrDataUrl: null,
  whatsappMessage: null,
  whatsappBusy: false,

  weixinQrDataUrl: null,
  weixinMessage: null,
  weixinBusy: false,
  weixinConnected: false,
  weixinSessionKey: null,
  weixinNeedsVerifyCode: false,
  weixinVerifyCode: "",

  togglingChannelId: null,
  toggleChannelError: {},

  nostrProfileFormState: null,
  nostrProfileAccountId: null,

  catalog: null,
  catalogLoading: false,
  catalogError: null,

  statusRefreshSeq: 0,
  statusLoading: false,
  statusLoadingProbe: null,

  // ── Catalog ─────────────────────────────────────────────────────────────────

  fetchCatalog: async () => {
    const client = useGatewayStore.getState().client;
    if (!client) return;
    set({ catalogLoading: true, catalogError: null });
    try {
      const res = await client.request<{ channels: ChannelCatalogEntry[] }>("channels.catalog", {});
      set({ catalog: res?.channels ?? [], catalogLoading: false });
    } catch (err) {
      set({ catalogError: String(err), catalogLoading: false });
    }
  },

  // ── Snapshot ────────────────────────────────────────────────────────────────

  applySnapshot: (snapshot) => {
    set({ snapshot, lastSuccessAt: Date.now(), lastError: null });
  },

  fetchStatus: async (probe) => {
    const client = useGatewayStore.getState().client;
    if (!client) {
      return;
    }
    const { statusLoading, statusLoadingProbe } = get();
    if (statusLoading && (statusLoadingProbe || !probe)) {
      return;
    }

    const refreshSeq = get().statusRefreshSeq + 1;
    set({
      loading: true,
      lastError: null,
      statusLoading: true,
      statusLoadingProbe: probe,
      statusRefreshSeq: refreshSeq,
    });
    try {
      const res = await client.request<ChannelsStatusSnapshot | null>("channels.status", {
        probe,
        timeoutMs: 8000,
      });
      if (get().statusRefreshSeq !== refreshSeq) {
        return;
      }
      if (res) {
        set({ snapshot: res, lastSuccessAt: Date.now() });
      }
    } catch (err) {
      if (get().statusRefreshSeq !== refreshSeq) {
        return;
      }
      set({ lastError: String(err) });
    } finally {
      if (get().statusRefreshSeq === refreshSeq) {
        set({ loading: false, statusLoading: false, statusLoadingProbe: null });
      }
    }
  },

  refreshPageData: async (options) => {
    const probe = options?.probe ?? false;
    const tasks: Promise<void>[] = [get().fetchStatus(probe), get().fetchCatalog()];
    if (options?.plugins) {
      const { usePluginsStore } = await import("./plugins.store");
      tasks.push(usePluginsStore.getState().fetchPlugins());
    }
    await Promise.all(tasks);
  },

  // ── Config schema ────────────────────────────────────────────────────────────

  fetchConfigSchema: async () => {
    const client = useGatewayStore.getState().client;
    if (!client) return;
    set({ configSchemaLoading: true });
    try {
      const res = await client.request<{ schema: unknown; uiHints?: Record<string, unknown> }>(
        "config.schema",
        {},
      );
      set({
        configSchema: res?.schema ?? null,
        configUiHints: res?.uiHints ?? {},
      });
    } catch {
      // schema loading failure is non-fatal
    } finally {
      set({ configSchemaLoading: false });
    }
  },

  // ── Config form ──────────────────────────────────────────────────────────────

  fetchConfigForm: async () => {
    const client = useGatewayStore.getState().client;
    if (!client) return;
    try {
      const res = await client.request<{ config?: Record<string, unknown>; raw?: string; hash?: string }>("config.get", {});
      set({ configForm: res?.config ?? null, configRaw: res?.raw ?? null, configBaseHash: res?.hash ?? null, configFormDirty: false });
    } catch {
      // ignore
    }
  },

  patchConfig: (path, value) => {
    const current = get().configForm ?? {};
    // Deep-clone and apply patch
    const next = applyPatch(current, path, value);
    set({ configForm: next, configFormDirty: true });
  },

  saveConfig: async () => {
    const client = useGatewayStore.getState().client;
    if (!client) return false;
    const configForm = get().configForm;
    const configBaseHash = get().configBaseHash;
    if (!configForm) return false;
    set({ configSaving: true });
    try {
      // config.set requires raw (JSON string) + optional baseHash, not a config object
      const raw = JSON.stringify(configForm, null, 2);
      const params: Record<string, unknown> = { raw };
      if (configBaseHash) { params.baseHash = configBaseHash; }
      await client.request("config.set", params);
      set({ configFormDirty: false });
      // Refresh to get updated raw + baseHash
      await get().fetchConfigForm();
      return true;
    } catch (err) {
      set({ lastError: String(err) });
      return false;
    } finally {
      set({ configSaving: false });
    }
  },

  reloadConfig: async () => {
    await get().fetchConfigForm();
  },

  // ── Channel enable/disable ───────────────────────────────────────────────────

  enableChannel: async (channelId, enabled) => {
    const client = useGatewayStore.getState().client;
    if (!client) {
      return null;
    }
    set((s) => ({
      togglingChannelId: channelId,
      toggleChannelError: { ...s.toggleChannelError, [channelId]: "" },
    }));
    try {
      const res = await client.request<ChannelsEnableResult>("channels.enable", {
        channelId,
        enabled,
      });
      if (enabled && res && !res.enabled) {
        const message = formatActivateFailure(
          res.reason,
          "Channel could not be enabled. Check Plugins allowlist and gateway logs.",
        );
        set((s) => ({
          toggleChannelError: { ...s.toggleChannelError, [channelId]: message },
        }));
        return res;
      }
      await Promise.all([get().fetchStatus(false), get().fetchCatalog()]);
      return res ?? { channelId, enabled };
    } catch (err) {
      const message = String(err);
      set((s) => ({
        toggleChannelError: { ...s.toggleChannelError, [channelId]: message },
      }));
      throw err;
    } finally {
      set({ togglingChannelId: null });
    }
  },

  waitForChannelRuntime: async (channelId) => {
    return waitForChannelRuntimeLoaded({
      channelId,
      refresh: async () => {
        await Promise.all([get().fetchCatalog(), get().fetchStatus(false)]);
      },
      readLoaded: () => {
        const { snapshot, catalog } = get();
        const entry = catalog?.find((item) => item.id === channelId);
        if (entry && !entry.installed) {
          return false;
        }
        if (entry?.pluginEnabled === false) {
          return false;
        }
        return isRuntimeChannelLoaded(snapshot, channelId);
      },
    });
  },

  activateChannel: async (channelId) => {
    const result = await get().enableChannel(channelId, true);
    if (!result?.enabled) {
      return {
        ok: false,
        reason:
          get().toggleChannelError[channelId] ??
          formatActivateFailure(result?.reason, "Failed to enable channel."),
      };
    }
    try {
      await useGatewayStore.getState().waitForConfigApplySettle();
    } catch (err) {
      return {
        ok: false,
        reason: String(err),
      };
    }
    if (channelId === WEIXIN_CHANNEL_ID) {
      const weixinReady = await get().waitForWeixinWebLoginProvider();
      if (!weixinReady.ok) {
        return {
          ok: false,
          timedOut: weixinReady.timedOut,
          reason: weixinReady.reason ?? WEIXIN_WEB_LOGIN_NOT_READY_MESSAGE,
        };
      }
      return { ok: true };
    }
    const wait = await get().waitForChannelRuntime(channelId);
    if (!wait.ok) {
      const message =
        "Config was saved but the channel plugin did not load in time. Try Refresh or check the gateway log.";
      set((s) => ({
        toggleChannelError: { ...s.toggleChannelError, [channelId]: message },
      }));
      return { ok: false, timedOut: wait.timedOut, reason: message };
    }
    return { ok: true };
  },

  waitForWeixinWebLoginProvider: async () => {
    const timeoutMs = 60_000;
    const intervalMs = 3_000;
    const started = Date.now();

    const refresh = async () => {
      await usePluginsStore.getState().fetchPlugins();
    };

    if (
      isWeixinWebLoginProviderReady({
        plugins: usePluginsStore.getState().plugins,
        catalog: get().catalog,
      })
    ) {
      return { ok: true };
    }

    while (Date.now() - started < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      await refresh();
      if (
        isWeixinWebLoginProviderReady({
          plugins: usePluginsStore.getState().plugins,
          catalog: get().catalog,
        })
      ) {
        return { ok: true };
      }
    }

    return {
      ok: false,
      timedOut: true,
      reason: WEIXIN_WEB_LOGIN_NOT_READY_MESSAGE,
    };
  },

  // ── WhatsApp ─────────────────────────────────────────────────────────────────

  startWhatsAppLogin: async (force) => {
    const client = useGatewayStore.getState().client;
    if (!client || get().whatsappBusy) return;
    set({ whatsappBusy: true, whatsappMessage: null, whatsappQrDataUrl: null });
    try {
      const res = await client.request<{ message?: string; qrDataUrl?: string }>(
        "web.login.start",
        { force, timeoutMs: 30000 },
      );
      set({
        whatsappMessage: res.message ?? null,
        whatsappQrDataUrl: res.qrDataUrl ?? null,
      });
    } catch (err) {
      set({ whatsappMessage: String(err), whatsappQrDataUrl: null });
    } finally {
      set({ whatsappBusy: false });
    }
  },

  waitForWhatsAppScan: async () => {
    const client = useGatewayStore.getState().client;
    if (!client || get().whatsappBusy) return;
    set({ whatsappBusy: true, whatsappMessage: "Waiting for scan…" });
    try {
      const res = await client.request<{ message?: string; connected?: boolean }>(
        "web.login.wait",
        { timeoutMs: 120000 },
      );
      set({
        whatsappMessage: res.message ?? null,
        whatsappQrDataUrl: res.connected ? null : get().whatsappQrDataUrl,
      });
    } catch (err) {
      set({ whatsappMessage: String(err) });
    } finally {
      set({ whatsappBusy: false });
    }
  },

  logoutWhatsApp: async () => {
    const client = useGatewayStore.getState().client;
    if (!client || get().whatsappBusy) return;
    set({ whatsappBusy: true });
    try {
      await client.request("channels.logout", { channel: "whatsapp" });
      set({ whatsappMessage: "Logged out.", whatsappQrDataUrl: null });
    } catch (err) {
      set({ whatsappMessage: String(err) });
    } finally {
      set({ whatsappBusy: false });
    }
  },

  // ── WeChat (openclaw-weixin) ──────────────────────────────────────────────────

  startWeixinLogin: async (force) => {
    const client = useGatewayStore.getState().client;
    if (!client || get().weixinBusy) return;
    set({
      weixinBusy: true,
      weixinMessage: null,
      weixinQrDataUrl: null,
      weixinSessionKey: null,
      weixinNeedsVerifyCode: false,
      weixinVerifyCode: "",
    });
    try {
      const res = await client.request<{ message?: string; qrDataUrl?: string; sessionKey?: string }>(
        "web.login.start",
        { channel: "openclaw-weixin", force, timeoutMs: 30000 },
      );
      const connected = isWeixinLoginSuccessMessage(res.message);
      set({
        weixinMessage: res.message ?? null,
        weixinQrDataUrl: res.qrDataUrl ?? null,
        weixinSessionKey: res.sessionKey ?? null,
        weixinConnected: connected,
      });
      if (connected) {
        await get().fetchStatus(false);
        return;
      }
      if (res.qrDataUrl) {
        if (!res.sessionKey) {
          set({
            weixinMessage: "登录会话无效，请重新生成二维码。",
            weixinQrDataUrl: null,
          });
          return;
        }
        await get().waitForWeixinScan();
      }
    } catch (err) {
      const message = String(err);
      set({
        weixinMessage: message.includes("web login provider is not available")
          ? WEIXIN_WEB_LOGIN_NOT_READY_MESSAGE
          : message,
        weixinQrDataUrl: null,
      });
    } finally {
      set({ weixinBusy: false });
    }
  },

  waitForWeixinScan: async () => {
    const client = useGatewayStore.getState().client;
    if (!client) return;
    set({ weixinBusy: true, weixinMessage: "等待扫码…" });
    const WAIT_SLICE_MS = 45_000;
    const MAX_WAIT_ROUNDS = 12;
    try {
      const sessionKey = get().weixinSessionKey;
      if (!sessionKey) {
        set({ weixinMessage: "缺少登录会话，请重新生成二维码。" });
        return;
      }
      const verifyCode = get().weixinVerifyCode.trim();
      for (let round = 0; round < MAX_WAIT_ROUNDS; round += 1) {
        const res = await client.request<{
          message?: string;
          connected?: boolean;
          qrDataUrl?: string;
          needsVerifyCode?: boolean;
          pending?: boolean;
        }>("web.login.wait", {
          channel: "openclaw-weixin",
          timeoutMs: WAIT_SLICE_MS,
          sessionKey,
          ...(verifyCode ? { verifyCode } : {}),
        });
        const connected = Boolean(res.connected) || isWeixinLoginSuccessMessage(res.message);
        if (res.qrDataUrl?.trim()) {
          set({ weixinQrDataUrl: res.qrDataUrl });
        }
        if (res.needsVerifyCode) {
          set({
            weixinMessage: res.message ?? "请输入手机微信显示的配对数字。",
            weixinNeedsVerifyCode: true,
          });
          return;
        }
        if (connected) {
          set({
            weixinMessage: res.message ?? null,
            weixinConnected: true,
            weixinQrDataUrl: null,
            weixinNeedsVerifyCode: false,
          });
          await get().fetchStatus(false);
          return;
        }
        if (res.pending) {
          const pendingMessage = res.message?.trim() || "等待扫码…";
          set({
            weixinMessage: pendingMessage,
            weixinNeedsVerifyCode: false,
          });
          await get().fetchStatus(false);
          if (isWeixinChannelConfigured(get().snapshot)) {
            set({
              weixinConnected: true,
              weixinQrDataUrl: null,
              weixinNeedsVerifyCode: false,
              weixinMessage: pendingMessage,
            });
            return;
          }
          continue;
        }
        set({
          weixinMessage: res.message ?? "登录未完成，请重试。",
          weixinConnected: false,
        });
        await get().fetchStatus(false);
        return;
      }
      set({ weixinMessage: "登录超时，请重新生成二维码。" });
      await get().fetchStatus(false);
    } catch (err) {
      const message = String(err);
      set({
        weixinMessage: message.includes("gateway closed")
          ? "网关已重启，请关闭对话框后重新打开并扫码。"
          : message,
      });
      await get().fetchStatus(false);
    } finally {
      set({ weixinBusy: false });
    }
  },

  logoutWeixin: async () => {
    const client = useGatewayStore.getState().client;
    if (!client || get().weixinBusy) return;
    set({ weixinBusy: true });
    try {
      await client.request("channels.logout", { channel: "openclaw-weixin" });
      set({ weixinMessage: "已退出登录 / Logged out.", weixinQrDataUrl: null, weixinConnected: false });
      await get().fetchStatus(false);
    } catch (err) {
      set({ weixinMessage: String(err) });
    } finally {
      set({ weixinBusy: false });
    }
  },

  // ── Nostr Profile ────────────────────────────────────────────────────────────

  editNostrProfile: (accountId, profile) => {
    set({
      nostrProfileAccountId: accountId,
      nostrProfileFormState: createNostrProfileFormState(profile),
    });
  },

  cancelNostrProfile: () => {
    set({ nostrProfileAccountId: null, nostrProfileFormState: null });
  },

  updateNostrProfileField: (field, value) => {
    const state = get().nostrProfileFormState;
    if (!state) return;
    set({
      nostrProfileFormState: {
        ...state,
        values: { ...state.values, [field]: value },
        success: null,
        error: null,
      },
    });
  },

  toggleNostrAdvanced: () => {
    const state = get().nostrProfileFormState;
    if (!state) return;
    set({
      nostrProfileFormState: { ...state, showAdvanced: !state.showAdvanced },
    });
  },

  saveNostrProfile: async () => {
    const client = useGatewayStore.getState().client;
    const formState = get().nostrProfileFormState;
    const accountId = get().nostrProfileAccountId;
    if (!client || !formState || !accountId) return;
    set({
      nostrProfileFormState: { ...formState, saving: true, error: null, success: null },
    });
    try {
      await client.request("nostr.profile.set", {
        accountId,
        profile: formState.values,
      });
      const updated = get().nostrProfileFormState;
      if (updated) {
        set({
          nostrProfileFormState: {
            ...updated,
            saving: false,
            success: "Profile published.",
            original: { ...formState.values },
          },
        });
      }
    } catch (err) {
      const current = get().nostrProfileFormState;
      if (current) {
        set({
          nostrProfileFormState: { ...current, saving: false, error: String(err) },
        });
      }
    }
  },

  importNostrProfile: async () => {
    const client = useGatewayStore.getState().client;
    const formState = get().nostrProfileFormState;
    const accountId = get().nostrProfileAccountId;
    if (!client || !formState || !accountId) return;
    set({
      nostrProfileFormState: { ...formState, importing: true, error: null },
    });
    try {
      const res = await client.request<{ profile?: NostrProfile }>("nostr.profile.get", {
        accountId,
      });
      if (res?.profile) {
        const imported = createNostrProfileFormState(res.profile);
        set({ nostrProfileFormState: { ...imported, importing: false } });
      } else {
        const current = get().nostrProfileFormState;
        if (current) set({ nostrProfileFormState: { ...current, importing: false } });
      }
    } catch (err) {
      const current = get().nostrProfileFormState;
      if (current) {
        set({
          nostrProfileFormState: { ...current, importing: false, error: String(err) },
        });
      }
    }
  },
}));

// ── Patch helper ──────────────────────────────────────────────────────────────

function applyPatch(
  obj: Record<string, unknown>,
  path: Array<string | number>,
  value: unknown,
): Record<string, unknown> {
  if (path.length === 0) return obj;
  const [head, ...rest] = path;
  if (rest.length === 0) {
    return { ...obj, [head]: value };
  }
  const child = (obj[head] as Record<string, unknown>) ?? {};
  return { ...obj, [head]: applyPatch(child, rest, value) };
}
