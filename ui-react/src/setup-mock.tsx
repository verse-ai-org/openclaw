import React from "react";
import ReactDOM from "react-dom/client";
import { SetupWizard, ElectronWizardAdapter } from "@openclaw/setup-wizard";
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
  },
};

// 注入 mock bridge
(window as unknown as { electronBridge: typeof mockElectronBridge }).electronBridge =
  mockElectronBridge;

const adapter = new ElectronWizardAdapter({
  onComplete: async () => {
    console.log("[Setup Mock] Wizard completed");
  },
  onCancel: async () => {
    console.log("[Setup Mock] Wizard cancelled");
    await mockElectronBridge.notifyOnboardingComplete();
  },
});

const root = document.getElementById("root");
if (!root) {throw new Error("Root element #root not found");}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <SetupWizard adapter={adapter} />
  </React.StrictMode>,
);
