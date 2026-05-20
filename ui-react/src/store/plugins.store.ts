import { create } from "zustand";
import type {
  PluginDiagnostic,
  PluginRecord,
  PluginsEnableResult,
  PluginsInstallResult,
} from "@/types/plugins";
import { normalizePluginRecord } from "@/lib/normalize-plugin-record";
import { useGatewayStore } from "./gateway.store";

// ── State ─────────────────────────────────────────────────────────────────────

interface PluginsState {
  // Loaded plugin list
  plugins: PluginRecord[];
  workspaceDir?: string;
  diagnostics: PluginDiagnostic[];
  loading: boolean;
  lastError: string | null;

  // Per-plugin toggling state
  togglingPluginId: string | null;
  toggleError: Record<string, string>;

  // Install state
  installing: boolean;
  installingSpec: string | null;
  installResult: PluginsInstallResult | null;
  installError: string | null;

  // Actions
  fetchPlugins: () => Promise<void>;
  enablePlugin: (pluginId: string, enabled: boolean) => Promise<PluginsEnableResult | null>;
  installPlugin: (spec: string) => Promise<PluginsInstallResult | null>;
  clearInstallResult: () => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const usePluginsStore = create<PluginsState>()((set, get) => ({
  plugins: [],
  workspaceDir: undefined,
  diagnostics: [],
  loading: false,
  lastError: null,

  togglingPluginId: null,
  toggleError: {},

  installing: false,
  installingSpec: null,
  installResult: null,
  installError: null,

  // ── Fetch ──────────────────────────────────────────────────────────────────

  fetchPlugins: async () => {
    const client = useGatewayStore.getState().client;
    if (!client) return;
    set({ loading: true, lastError: null });
    try {
      const res = await client.request<{
        plugins: PluginRecord[];
        workspaceDir?: string;
        diagnostics?: PluginDiagnostic[];
      }>("plugins.status", {});
      set({
        plugins: (res?.plugins ?? []).map(normalizePluginRecord),
        workspaceDir: res?.workspaceDir,
        diagnostics: res?.diagnostics ?? [],
        loading: false,
      });
    } catch (err) {
      set({ loading: false, lastError: String(err) });
    }
  },

  // ── Enable / disable ───────────────────────────────────────────────────────

  enablePlugin: async (pluginId: string, enabled: boolean) => {
    const client = useGatewayStore.getState().client;
    if (!client) {
      return null;
    }
    set((s) => ({
      togglingPluginId: pluginId,
      toggleError: { ...s.toggleError, [pluginId]: "" },
    }));
    try {
      const res = await client.request<PluginsEnableResult>("plugins.enable", {
        pluginId,
        enabled,
      });
      // Optimistically update the plugin record in state
      set((s) => ({
        togglingPluginId: null,
        plugins: s.plugins.map((p) =>
          p.id === pluginId
            ? {
                ...p,
                enabled: res?.enabled ?? enabled,
                status: (res?.enabled ?? enabled) ? "loaded" : "disabled",
              }
            : p,
        ),
      }));
      return res ?? { pluginId, enabled };
    } catch (err) {
      set((s) => ({
        togglingPluginId: null,
        toggleError: { ...s.toggleError, [pluginId]: String(err) },
      }));
      throw err;
    }
  },

  // ── Install ────────────────────────────────────────────────────────────────

  installPlugin: async (spec: string) => {
    const client = useGatewayStore.getState().client;
    if (!client) {
      return null;
    }
    set({ installing: true, installingSpec: spec, installResult: null, installError: null });
    try {
      const res = await client.request<PluginsInstallResult>("plugins.install", { spec });
      set({ installing: false, installingSpec: null, installResult: res ?? null });
      if (res?.ok) {
        await get().fetchPlugins();
      } else if (res?.error) {
        set({ installError: res.error });
      }
      return res ?? null;
    } catch (err) {
      const message = String(err);
      set({ installing: false, installingSpec: null, installError: message });
      throw err;
    }
  },

  clearInstallResult: () => set({ installResult: null, installError: null }),
}));
