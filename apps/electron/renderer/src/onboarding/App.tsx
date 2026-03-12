import { useState, useCallback, useEffect } from "react";
import type {
  WizardStep,
  WizardStartResult,
  WizardNextResult,
} from "./types";
import { WizardStepView } from "./WizardStep.tsx";
import "./App.css";
type AppState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "wizard"; sessionId: string; step: WizardStep }
  | { phase: "done" };

export function App() {
  const [appState, setAppState] = useState<AppState>({ phase: "loading" });
  const [textValue, setTextValue] = useState("");
  const [selectedValue, setSelectedValue] = useState<string | undefined>(undefined);
  const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // 重置步骤级别的输入状态
  const resetStepInputs = useCallback(() => {
    setTextValue("");
    setSelectedValue(undefined);
    setSelectedValues(new Set());
  }, []);

  // 启动 wizard
  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const result = await window.electronBridge.wizardRequest("wizard.start", {
          mode: "local",
        }) as WizardStartResult;

        if (cancelled) return;

        console.log("[onboarding] wizard.start result:", JSON.stringify(result));

        if (result.done || !result.step) {
          // wizard 已完成（配置已存在），直接跳转
          console.warn("[onboarding] wizard done immediately, status=", result.status, "error=", result.error);
          await window.electronBridge.notifyOnboardingComplete();
          return;
        }
        setSessionId(result.sessionId);
        setAppState({ phase: "wizard", sessionId: result.sessionId, step: result.step });
      } catch (err) {
        if (cancelled) return;
        setAppState({
          phase: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    void start();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = useCallback(async (value: unknown) => {
    if (appState.phase !== "wizard" || submitting) return;
    const { step } = appState;

    setSubmitting(true);
    try {
      const result = await window.electronBridge.wizardRequest("wizard.next", {
        sessionId: appState.sessionId,
        answer: { stepId: step.id, value },
      }) as WizardNextResult;

      resetStepInputs();

      if (result.done || !result.step) {
        // 向导完成
        setAppState({ phase: "done" });
        // 等待短暂动画后切换到 Control UI
        setTimeout(async () => {
          try {
            // 重启 Gateway 以使新配置生效
            await window.electronBridge.restartGateway();
          } catch {
            // 重启失败不阻止跳转
          }
          await window.electronBridge.notifyOnboardingComplete();
        }, 1200);
      } else {
        setAppState({ phase: "wizard", sessionId: appState.sessionId, step: result.step });
      }
    } catch (err) {
      setAppState({
        phase: "wizard",
        sessionId: appState.sessionId,
        step,
      });
      // 简单地将错误反映在 UI 上（可扩展为 error banner）
      console.error("[onboarding] wizard.next error:", err);
    } finally {
      setSubmitting(false);
    }
  }, [appState, submitting, resetStepInputs]);

  const handleSkip = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (sessionId) {
        await window.electronBridge.wizardRequest("wizard.cancel", { sessionId });
      }
    } catch {
      // 忽略取消错误
    } finally {
      setSubmitting(false);
    }
    await window.electronBridge.notifyOnboardingComplete();
  }, [sessionId, submitting]);

  // 加载中
  if (appState.phase === "loading") {
    return (
      <div className="wizard-overlay">
        <div className="wizard-card">
          <div className="wizard-loader">
            <div className="wizard-spinner" />
            <p>Starting Gateway…</p>
          </div>
        </div>
      </div>
    );
  }

  // 错误
  if (appState.phase === "error") {
    return (
      <div className="wizard-overlay">
        <div className="wizard-card">
          <div className="wizard-header">
            <h1 className="wizard-title">Setup Error</h1>
          </div>
          <p className="wizard-error">{appState.message}</p>
          <button className="wizard-skip-btn" onClick={() => void handleSkip()}>
            Skip Setup
          </button>
        </div>
      </div>
    );
  }

  // 完成
  if (appState.phase === "done") {
    return (
      <div className="wizard-overlay">
        <div className="wizard-card wizard-card--done">
          <div className="wizard-done-icon">✓</div>
          <h1 className="wizard-title">Setup Complete</h1>
          <p className="wizard-subtitle">OpenClaw is ready. Opening dashboard…</p>
        </div>
      </div>
    );
  }

  // 向导步骤
  const { step } = appState;
  return (
    <div className="wizard-overlay">
      <div className="wizard-card">
        <div className="wizard-header">
          <div className="wizard-brand">
            <span className="wizard-brand-logo">⚡</span>
            <span className="wizard-brand-name">OPENCLAW</span>
          </div>
          <h1 className="wizard-title">{step.title}</h1>
          {step.subtitle && <p className="wizard-subtitle">{step.subtitle}</p>}
        </div>

        <div className="wizard-body">
          <WizardStepView
            step={step}
            textValue={textValue}
            selectedValue={selectedValue}
            selectedValues={selectedValues}
            submitting={submitting}
            onTextChange={setTextValue}
            onSelectChange={setSelectedValue}
            onMultiselectChange={setSelectedValues}
            onSubmit={(value) => void handleSubmit(value)}
          />
        </div>

        <div className="wizard-footer">
          <button
            className="wizard-skip-btn"
            disabled={submitting}
            onClick={() => void handleSkip()}
          >
            Skip Setup
          </button>
        </div>
      </div>
    </div>
  );
}
