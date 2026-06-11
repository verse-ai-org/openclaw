import React, { useRef } from "react";
import ReactDOM from "react-dom/client";
import { SetupWizard } from "@/components/setup-wizard/index";
import { ElectronWizardAdapter } from "@/adapters/ElectronWizardAdapter";
import { useWizardStore } from "@/store/setup-wizard.store";
import "./index.css";

/**
 * setup-mock.tsx - 浏览器开发入口
 * 注入 mock electronBridge，模拟 Electron IPC 通信，无需运行真实 Electron
 */

const MOCK_STEPS = [
  { id: "welcome",    title: "Welcome to OpenClaw",        subtitle: "Let's set up your AI assistant" },
  { id: "security",  title: "Security Confirmation",       subtitle: "Confirm you understand the security implications" },
  { id: "model",     title: "Select AI Model",             subtitle: "Choose your preferred AI model" },
  { id: "api-key",   title: "API Key",                     subtitle: "Enter your API key" },
  { id: "features",  title: "Optional Features",           subtitle: "Enable additional features" },
  { id: "completion",title: "Setup Complete",              subtitle: "Your OpenClaw is ready to use" },
];

let mockCurrentStepIndex = 0;
const mockOAuthStartTime: Record<string, number> = {};

const mockElectronBridge = {
  wizardRequest: async (method: string, params: unknown) => {
    console.log(`[Mock IPC] ${method}`, params);
    await new Promise((r) => setTimeout(r, 300)); // simulate latency

    if (method === "wizard.start") {
      mockCurrentStepIndex = 0;
      return {
        sessionId: "mock-session-123",
        done: false,
        step: MOCK_STEPS[0],
        status: "running",
      };
    }

    if (method === "wizard.next") {
      mockCurrentStepIndex++;
      if (mockCurrentStepIndex >= MOCK_STEPS.length) {
        return { sessionId: "mock-session-123", done: true, status: "completed" };
      }
      return {
        sessionId: "mock-session-123",
        done: false,
        step: MOCK_STEPS[mockCurrentStepIndex],
        status: "running",
      };
    }

    if (method === "wizard.cancel") {return { ok: true };}
    if (method === "gateway:restart") {
      await new Promise((r) => setTimeout(r, 1000));
      return { ok: true };
    }
    if (method === "onboarding:complete") {return { ok: true };}

    return { error: `Unknown method: ${method}` };
  },

  notifyOnboardingComplete: async () => {
    console.log("[Mock IPC] notifyOnboardingComplete");
    alert("✅ Setup complete! In Electron, this would open the main dashboard.");
  },

  restartGateway: async () => {
    console.log("[Mock IPC] restartGateway");
    return { ok: true };
  },

  saveOnboardingConfig: async (cfg: unknown) => {
    console.log("[Mock IPC] saveOnboardingConfig", cfg);
    return { ok: true };
  },

  writeDebugLog: async (message: string) => {
    console.log(`[Mock Debug] ${message}`);
  },

  validateApiKey: async (authMethod: string, apiKey: string) => {
    console.log(`[Mock IPC] validateApiKey authMethod=${authMethod}`);
    await new Promise((r) => setTimeout(r, 500));
    if (!apiKey.trim()) {
      return { ok: false, error: "API key cannot be empty." };
    }
    // Simulate invalid key if it's obviously a placeholder
    if (apiKey.trim().length < 8) {
      return { ok: false, error: "Invalid API key (too short)." };
    }
    return { ok: true };
  },

  oauthStart: async (authMethod: string) => {
    console.log(`[Mock IPC] oauthStart authMethod=${authMethod}`);
    await new Promise((r) => setTimeout(r, 300));
    mockOAuthStartTime[authMethod] = Date.now();
    return { ok: true };
  },

  oauthPoll: async (authMethod: string) => {
    console.log(`[Mock IPC] oauthPoll authMethod=${authMethod}`);
    // Simulate OAuth completing after ~4s (2 poll cycles)
    const elapsed = Date.now() - (mockOAuthStartTime[authMethod] ?? Date.now());
    if (elapsed < 4000) {
      return { ok: false, error: "pending" };
    }
    return { ok: true, token: "mock-oauth-token-abc123" };
  },

  oauthCancel: async (authMethod: string) => {
    console.log(`[Mock IPC] oauthCancel authMethod=${authMethod}`);
    delete mockOAuthStartTime[authMethod];
    return { ok: true };
  },

  validateInviteCode: async (code: string) => {
    console.log(`[Mock IPC] validateInviteCode code=${code}`);
    await new Promise((r) => setTimeout(r, 500));
    
    // Strict format check: BOSS-XXXX-XXXX (4 alphanumeric chars per segment)
    const pattern = /^BOSS-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;
    if (!pattern.test(code.trim())) {
      return { ok: false, error: "Invalid invite code format. Expected: BOSS-XXXX-XXXX" };
    }
    
    // Mock success: mirrors the real response shape { apiKey, model }
    return {
      ok: true,
      apiKey: "sk-mock-invite-code-" + code.replace(/-/g, "").toLowerCase(),
      model: "anthropic/claude-opus-4-5"
    };
  },

  authStart: async () => {
    console.log("[Mock IPC] authStart");
    mockOAuthStartTime["bossim-auth"] = Date.now();
    return { ok: true };
  },

  authPoll: async () => {
    const elapsed = Date.now() - (mockOAuthStartTime["bossim-auth"] ?? Date.now());
    if (elapsed < 4000) {
      return { ok: false, error: "pending" };
    }
    return {
      ok: true,
      user: {
        id: "mock-user",
        email: "mock@bossim.local",
        display_name: "Mock User",
        avatar_url: "",
      },
    };
  },

  authCancel: async () => ({ ok: true }),

  authGetSession: async () => ({ user: null, status: "unauthenticated" as const }),

  authLogout: async () => ({ ok: true }),

  onAuthSessionChanged: () => () => {},
};

// 注入 mock bridge
(window as unknown as { electronBridge: typeof mockElectronBridge }).electronBridge =
  mockElectronBridge;

// Mock SetupApp — mirrors setup.tsx structure, adds getConfig so store data is persisted
function MockSetupApp() {
  const { wizardState } = useWizardStore();
  const wizardStateRef = useRef(wizardState);
  wizardStateRef.current = wizardState;

  const adapter = React.useMemo(
    () =>
      new ElectronWizardAdapter({
        onComplete: async () => {
          console.log("[Setup Mock] Wizard completed, state:", wizardStateRef.current);
        },
        onCancel: async () => {
          console.log("[Setup Mock] Wizard cancelled");
          await mockElectronBridge.notifyOnboardingComplete();
        },
        getConfig: () => {
          console.log("[Setup Mock] getConfig called:", wizardStateRef.current);
          return wizardStateRef.current;
        },
      }),
    [],
  );

  return <SetupWizard adapter={adapter} />;
}

const root = document.getElementById("root");
if (!root) {throw new Error("Root element #root not found");}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <MockSetupApp />
  </React.StrictMode>,
);
