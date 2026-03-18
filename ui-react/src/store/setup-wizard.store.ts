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

  /**
   * @deprecated Use authProviderGroup + authMethod + resolvedModelId instead.
   * Kept for backwards compatibility with existing Electron onboarding.ts.
   */
  selectedModel: string;

  // ─── API Key ──────────────────────────────────────────────────────────────
  apiKey: string;
  /** For OAuth flows: the refresh token returned by the provider */
  oauthRefresh?: string;
  /** For OAuth flows: token expiry (unix timestamp ms) */
  oauthExpires?: number;

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
  // Legacy field — kept in sync by ModelSelectionStep
  selectedModel: "claude",
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
      partialize: (state) => ({
        wizardState: state.wizardState,
      }),
    },
  ),
);
