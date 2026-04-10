import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface WizardState {
  // ─── Auth / Model selection ───────────────────────────────────────────────
  /**
   * Provider group selected in step 1, e.g. "openai" | "anthropic" | "google".
   * Maps to AuthChoiceGroupId in the CLI.
   */
  authProviderGroup: string;

  /**
   * Specific auth method within the provider group, e.g. "openai-api-key" |
   * "openai-codex" | "apiKey" | "gemini-api-key".
   * Maps to AuthChoice in the CLI.
   */
  authMethod: string;

  /**
   * Fully-qualified model id written to agents.defaults.model.primary,
   * e.g. "openai/gpt-5.1-codex" | "anthropic/claude-opus-4-5".
   * Derived from authMethod by default; overridable in DefaultModelStep.
   */
  resolvedModelId: string;

  /**
   * How API keys are persisted: plaintext (stored directly) or ref (env-var reference).
   * Mirrors CLI --secret-input-mode.
   */
  secretInputMode: "plaintext" | "ref";

  // ─── API Key ──────────────────────────────────────────────────────────────
  apiKey: string;
  /** For OAuth flows: the refresh token returned by the provider */
  oauthRefresh?: string;
  /** For OAuth flows: token expiry (unix timestamp ms) */
  oauthExpires?: number;

  // ─── Invite Code ──────────────────────────────────────────────────────────
  /**
   * Whether the current setup came from an invite code (true) or manual config (false).
   * Used to track the setup path for analytics and UX purposes.
   */
  usedInviteCode?: boolean;

  /**
   * From invite code response: Brave Search API key.
   * Written into openclaw.json tools.web.search.apiKey on wizard completion.
   */
  braveApiKey?: string;

  /**
   * From invite code response: Amap (高德) LBS API key.
   * Written into openclaw.json skills.entries.amap-lbs-skill.apiKey on wizard completion.
   */
  amapApiKey?: string;

  // ─── Workspace ───────────────────────────────────────────────────────────
  workspace: string;

  // ─── Optional features ───────────────────────────────────────────────────
  optionalFeatures: {
    messaging?: boolean;
    browser?: boolean;
    fileAccess?: boolean;
  };

  // ─── Gateway settings ─────────────────────────────────────────────────────
  gatewayPort: number;
  gatewayBind: "loopback" | "lan" | "custom";
  gatewayAuth: "token" | "password";

  // ─── Daemon settings ──────────────────────────────────────────────────────
  installDaemon: boolean;
  daemonRuntime: "node" | "bun";

  // ─── UI state ─────────────────────────────────────────────────────────────
  currentStep: number;
  isComplete: boolean;
}

interface WizardStore {
  wizardState: WizardState;
  updateWizardState: (partial: Partial<WizardState>) => void;
  resetWizardState: () => void;
  getWizardState: () => WizardState;
}

const DEFAULT_STATE: WizardState = {
  authProviderGroup: "anthropic",
  authMethod: "apiKey",
  resolvedModelId: "anthropic/claude-opus-4-5",
  secretInputMode: "plaintext",
  apiKey: "",
  workspace: "~/.openclaw/workspace",
  optionalFeatures: {
    messaging: false,
    browser: true,
    fileAccess: false,
  },
  gatewayPort: 18789,
  gatewayBind: "loopback",
  gatewayAuth: "token",
  installDaemon: true,
  daemonRuntime: "node",
  currentStep: 0,
  isComplete: false,
};

export const useWizardStore = create<WizardStore>()(
  persist(
    (set, get) => ({
      wizardState: DEFAULT_STATE,

      updateWizardState: (partial) => {
        set((state) => ({
          wizardState: {
            ...state.wizardState,
            ...partial,
          },
        }));
      },

      resetWizardState: () => {
        set({ wizardState: DEFAULT_STATE });
      },

      getWizardState: () => {
        return get().wizardState;
      },
    }),
    {
      name: "openclaw-wizard-storage",
      version: 2,
      migrate(persistedState: unknown, version: number) {
        // v1 → v2: remove deprecated selectedModel field
        if (version < 2) {
          const s = persistedState as Record<string, unknown>;
          const ws = s["wizardState"] as Record<string, unknown> | undefined;
          if (ws) {
            delete ws["selectedModel"];
          }
        }
        return persistedState as WizardStore;
      },
      partialize: (state) => ({
        wizardState: state.wizardState,
      }),
    },
  ),
);
