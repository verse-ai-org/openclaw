import React from "react";
import ReactDOM from "react-dom/client";
import { SetupWizard } from "@/components/setup-wizard";
import "@/index.css";

// Mock Electron Bridge for browser testing
const mockElectronBridge = {
  wizardRequest: async (method: string, params: unknown) => {
    console.log(`[Mock IPC] ${method}`, params);

    // Simulate wizard.start
    if (method === "wizard.start") {
      return {
        sessionId: "mock-session-123",
        done: false,
        step: {
          id: "welcome",
          title: "Welcome to OpenClaw",
          subtitle: "Let's set up your AI assistant",
          type: "text",
          options: [],
        },
        status: "running",
      };
    }

    // Simulate wizard.next
    if (method === "wizard.next") {
      const answer = params?.answer;
      console.log("[Mock IPC] User answered:", answer);

      // Simulate step progression
      const steps = [
        {
          id: "welcome",
          title: "Welcome to OpenClaw",
          subtitle: "Let's set up your AI assistant",
          type: "text",
          options: [],
        },
        {
          id: "security",
          title: "Security Confirmation",
          subtitle: "Confirm you understand the security implications",
          type: "checkbox",
          options: [{ id: "understand", label: "I understand the security implications" }],
        },
        {
          id: "model",
          title: "Select AI Model",
          subtitle: "Choose your preferred AI model",
          type: "select",
          options: [
            { id: "gpt4", label: "GPT-4" },
            { id: "claude", label: "Claude" },
            { id: "local", label: "Local Model" },
          ],
        },
        {
          id: "api-key",
          title: "API Key",
          subtitle: "Enter your API key",
          type: "password",
          options: [],
        },
        {
          id: "features",
          title: "Optional Features",
          subtitle: "Enable additional features",
          type: "multiselect",
          options: [
            { id: "voice", label: "Voice Input" },
            { id: "vision", label: "Vision" },
            { id: "web", label: "Web Search" },
          ],
        },
        {
          id: "completion",
          title: "Setup Complete",
          subtitle: "Your OpenClaw is ready to use",
          type: "text",
          options: [],
        },
      ];

      // Find current step index
      const currentStepId = answer?.stepId;
      const currentIndex = steps.findIndex((s) => s.id === currentStepId);
      const nextIndex = currentIndex + 1;

      // Simulate delay (like real API call)
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (nextIndex >= steps.length) {
        // Wizard complete
        return {
          sessionId: "mock-session-123",
          done: true,
          status: "completed",
        };
      }

      return {
        sessionId: "mock-session-123",
        done: false,
        step: {
          ...steps[nextIndex],
          options: steps[nextIndex].options || [],
        },
        status: "running",
      };
    }

    // Simulate wizard.cancel
    if (method === "wizard.cancel") {
      return { ok: true };
    }

    // Simulate gateway:restart
    if (method === "gateway:restart") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { ok: true };
    }

    // Simulate onboarding:complete
    if (method === "onboarding:complete") {
      console.log("[Mock IPC] onboarding:complete called");
      return { ok: true };
    }

    return { error: "Unknown method" };
  },

  notifyOnboardingComplete: async () => {
    console.log("[Mock IPC] notifyOnboardingComplete called");
    alert("Setup complete! In real app, would switch to Control UI.");
  },

  restartGateway: async () => {
    console.log("[Mock IPC] restartGateway called");
  },
};

// Inject mock bridge into window
(window as unknown as { electronBridge: typeof mockElectronBridge }).electronBridge =
  mockElectronBridge;

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <SetupWizard />
  </React.StrictMode>,
);
