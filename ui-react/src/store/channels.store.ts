import { create } from "zustand";
import type {
  ChannelCatalogEntry,
  ChannelsStatusSnapshot,
  NostrProfile,
  NostrProfileFormState,
} from "@/types/channels";
import { useGatewayStore } from "./gateway.store";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

  // Nostr profile editing
  nostrProfileFormState: NostrProfileFormState | null;
  nostrProfileAccountId: string | null;

  // Actions
  fetchStatus: (probe: boolean) => Promise<void>;
  fetchConfigSchema: () => Promise<void>;
  fetchConfigForm: () => Promise<void>;
  patchConfig: (path: Array<string | number>, value: unknown) => void;
  saveConfig: () => Promise<boolean>;
  reloadConfig: () => Promise<void>;
  enableChannel: (channelId: string, enabled: boolean) => Promise<void>;
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

  togglingChannelId: null,
  toggleChannelError: {},

  nostrProfileFormState: null,
  nostrProfileAccountId: null,

  catalog: null,
  catalogLoading: false,
  catalogError: null,

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
    if (!client) return;
    set({ loading: true, lastError: null });
    try {
      const res = await client.request<ChannelsStatusSnapshot | null>("channels.status", {
        probe,
        timeoutMs: 8000,
      });
      if (res) {
        set({ snapshot: res, lastSuccessAt: Date.now() });
      }
    } catch (err) {
      set({ lastError: String(err) });
    } finally {
      set({ loading: false });
    }
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
    if (!client) return;
    set((s) => ({
      togglingChannelId: channelId,
      toggleChannelError: { ...s.toggleChannelError, [channelId]: "" },
    }));
    try {
      await client.request("channels.enable", { channelId, enabled });
      // Refresh status to reflect the new enabled state
      await get().fetchStatus(false);
    } catch (err) {
      set((s) => ({
        toggleChannelError: { ...s.toggleChannelError, [channelId]: String(err) },
      }));
      throw err;
    } finally {
      set({ togglingChannelId: null });
    }
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
    set({ weixinBusy: true, weixinMessage: null, weixinQrDataUrl: null, weixinSessionKey: null });
    try {
      const res = await client.request<{ message?: string; qrDataUrl?: string; sessionKey?: string }>(
        "web.login.start",
        { channel: "openclaw-weixin", force, timeoutMs: 30000 },
      );
      set({
        weixinMessage: res.message ?? null,
        weixinQrDataUrl: res.qrDataUrl ?? null,
        weixinSessionKey: res.sessionKey ?? null,
      });
    } catch (err) {
      set({ weixinMessage: String(err), weixinQrDataUrl: null });
    } finally {
      set({ weixinBusy: false });
    }
  },

  waitForWeixinScan: async () => {
    const client = useGatewayStore.getState().client;
    if (!client || get().weixinBusy) return;
    set({ weixinBusy: true, weixinMessage: "等待扫码…" });
    try {
      const sessionKey = get().weixinSessionKey;
      const res = await client.request<{ message?: string; connected?: boolean }>(
        "web.login.wait",
        { channel: "openclaw-weixin", timeoutMs: 300000, ...(sessionKey ? { sessionKey } : {}) },
      );
      set({
        weixinMessage: res.message ?? null,
        weixinConnected: res.connected ?? false,
        weixinQrDataUrl: res.connected ? null : get().weixinQrDataUrl,
      });
      // Always refresh status after wait completes (connected or not)
      await get().fetchStatus(false);
    } catch (err) {
      set({ weixinMessage: String(err) });
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
