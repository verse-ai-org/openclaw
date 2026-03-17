import { createRoot } from "react-dom/client";
import { useRef, useState, useMemo } from "react";
import { SetupWizard, ElectronWizardAdapter, useWizardStore } from "@openclaw/setup-wizard";
import "./index.css";

/**
 * setup.tsx - 生产入口
 * 运行在 Electron 渲染进程中，通过 window.electronBridge 与主进程通信
 *
 * NOTE: adapter 需要在组件内创建，才能通过 useRef 始终拿到最新的 wizardState。
 * 否则 getConfig 闭包会捕获初始空状态。
 */
function SetupApp() {
  const [_phase, setPhase] = useState("wizard");
  const { wizardState } = useWizardStore();

  // Always holds the latest wizardState — avoids stale closure in useMemo([]).
  const wizardStateRef = useRef(wizardState);
  wizardStateRef.current = wizardState;

  const adapter = useMemo(
    () =>
      new ElectronWizardAdapter({
        onComplete: async () => {
          console.log("[Setup] onComplete callback");
          setPhase("done");
        },
        onCancel: async () => {
          console.log("[Setup] Wizard cancelled");
          await window.electronBridge.notifyOnboardingComplete();
        },
        // Provide latest wizard state so ElectronWizardAdapter.finalizeOnboarding()
        // can persist it to ~/.openclaw/openclaw.json via IPC.
        getConfig: () => {
          console.log("[Setup] getConfig called, state:", wizardStateRef.current);
          return wizardStateRef.current;
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return <SetupWizard adapter={adapter} />;
}

const root = document.getElementById("root");
if (!root) {throw new Error("Root element #root not found");}

createRoot(root).render(<SetupApp />);
