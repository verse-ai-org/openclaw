import { create } from "zustand";
import type {
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
  configUiHints: Record<string, unknown>;
  configSaving: boolean;
  configFormDirty: boolean;

  // WhatsApp specific
  whatsappQrDataUrl: string | null;
  whatsappMessage: string | null;
  whatsappBusy: boolean;

  // Nostr profile editing
  nostrProfileFormState: NostrProfileFormState | null;
  nostrProfileAccountId: string | null;

  // Actions
  fetchStatus: (probe: boolean) => Promise<void>;
  fetchConfigSchema: () => Promise<void>;
  fetchConfigForm: () => Promise<void>;
  patchConfig: (path: Array<string | number>, value: unknown) => void;
  saveConfig: () => Promise<void>;
  reloadConfig: () => Promise<void>;
  startWhatsAppLogin: (force: boolean) => Promise<void>;
  waitForWhatsAppScan: () => Promise<void>;
  logoutWhatsApp: () => Promise<void>;
  editNostrProfile: (accountId: string, profile: NostrProfile | null) => void;
  cancelNostrProfile: () => void;
  updateNostrProfileField: (field: keyof NostrProfile, value: string) => void;
  saveNostrProfile: () => Promise<void>;
  importNostrProfile: () => Promise<void>;
  toggleNostrAdvanced: () => void;
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
  configUiHints: {},
  configSaving: false,
  configFormDirty: false,

  whatsappQrDataUrl: null,
  whatsappMessage: null,
  whatsappBusy: false,

  nostrProfileFormState: null,
  nostrProfileAccountId: null,

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
      const res = await client.request<{ config?: Record<string, unknown> }>("config.get", {});
      set({ configForm: res?.config ?? null, configFormDirty: false });
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
    if (!client) return;
    const configForm = get().configForm;
    if (!configForm) return;
    set({ configSaving: true });
    try {
      await client.request("config.set", { config: configForm });
      set({ configFormDirty: false });
    } catch (err) {
      // Surface error via lastError briefly
      set({ lastError: String(err) });
    } finally {
      set({ configSaving: false });
    }
  },

  reloadConfig: async () => {
    await get().fetchConfigForm();
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
