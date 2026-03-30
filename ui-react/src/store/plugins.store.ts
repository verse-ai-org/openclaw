import { create } from "zustand";
import type {
  PluginDiagnostic,
  PluginRecord,
  PluginsEnableResult,
  PluginsInstallResult,
} from "@/types/plugins";
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
  installResult: PluginsInstallResult | null;
  installError: string | null;

  // Actions
  fetchPlugins: () => Promise<void>;
  enablePlugin: (pluginId: string, enabled: boolean) => Promise<void>;
  installPlugin: (spec: string) => Promise<void>;
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
        plugins: res?.plugins ?? [],
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
    if (!client) return;
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
    if (!client) return;
    set({ installing: true, installResult: null, installError: null });
    try {
      const res = await client.request<PluginsInstallResult>("plugins.install", { spec });
      set({ installing: false, installResult: res ?? null });
      // Refresh the list after a successful install
      if (res?.ok) {
        await get().fetchPlugins();
      }
    } catch (err) {
      set({ installing: false, installError: String(err) });
    }
  },

  clearInstallResult: () => set({ installResult: null, installError: null }),
}));
