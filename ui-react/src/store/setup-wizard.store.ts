import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface WizardState {
  // Basic settings
  selectedModel: string;
  apiKey: string;
  workspace: string;

  // Optional features
  optionalFeatures: {
    messaging?: boolean;
    browser?: boolean;
    fileAccess?: boolean;
  };

  // Gateway settings
  gatewayPort: number;
  gatewayBind: "loopback" | "lan" | "custom";
  gatewayAuth: "token" | "password";

  // Daemon settings
  installDaemon: boolean;
  daemonRuntime: "node" | "bun";

  // UI state
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
