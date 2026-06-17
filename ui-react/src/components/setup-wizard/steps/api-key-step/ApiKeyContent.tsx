import { ExternalLink, CheckCircle, XCircle, Loader2, Eye, EyeOff } from "lucide-react";
import { useState, useEffect } from "react";
import { findAuthMethod } from "@/store/provider-catalog.store";
import { useWizardStore } from "@/store/setup-wizard.store";
import { useWizardAdapter } from "@/context/AdapterContext";

export interface ApiKeyContentProps {
  methodId: string;
  onNext: () => void;
  onCanProceedChange?: (can: boolean) => void;
}

export function ApiKeyContent({
  methodId,
  onNext,
  onCanProceedChange,
}: ApiKeyContentProps) {
  const { wizardState, updateWizardState } = useWizardStore();
  const adapter = useWizardAdapter();
  const methodDef = findAuthMethod(methodId);

  const consoleUrl = methodDef?.consoleUrl ?? "";
  const keyPlaceholder = methodDef?.keyPlaceholder ?? "Paste your API key...";

  const [apiKey, setApiKey] = useState(wizardState.apiKey || "");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    onCanProceedChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onCanProceedChange?.(testResult === "success");
  }, [testResult, onCanProceedChange]);

  const handleTestConnection = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setTestResult("error");
      setTestError("API key cannot be empty.");
      return;
    }
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      if (adapter.validateApiKey) {
        const result = await adapter.validateApiKey(methodId, trimmed);
        if (result.ok) {
          updateWizardState({ apiKey: trimmed });
          setTestResult("success");
          onCanProceedChange?.(true);
        } else {
          setTestResult("error");
          setTestError(result.error ?? "Validation failed.");
        }
      } else {
        updateWizardState({ apiKey: trimmed });
        setTestResult("success");
        onCanProceedChange?.(true);
      }
    } catch (err) {
      setTestResult("error");
      setTestError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {consoleUrl && (
        <a
          href={consoleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex cursor-pointer items-center justify-between rounded-2xl bg-zinc-100 px-5 py-5 no-underline"
        >
          <div className="flex items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#ffdada] text-[20px]">
              🔑
            </div>
            <div>
              <p className="m-0 text-base font-semibold leading-[1.4] text-[#1a1c1d]">Developer Console</p>
              <p className="m-0 text-xs leading-[1.4] text-[#5b4041]">Retrieve your production API keys</p>
            </div>
          </div>
          <ExternalLink className="size-[18px] shrink-0 text-[#5b4041]" />
        </a>
      )}

      <div className="flex flex-col gap-3">
        <div className="px-1">
          <span className="text-[10px] font-bold uppercase tracking-[1.2px] text-[#5b4041]">Secret API Key</span>
        </div>
        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            placeholder={keyPlaceholder}
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setTestResult(null);
              setTestError(null);
            }}
            className="h-[55px] w-full rounded-2xl border-0 bg-[#e8e8ea] px-6 pr-[52px] text-sm text-[#1a1c1d] outline-none"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-4 top-1/2 flex -translate-y-1/2 cursor-pointer items-center border-0 bg-transparent text-zinc-500"
          >
            {showKey ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </button>
        </div>
        <p className="m-0 px-1 text-[11px] text-[#5b4041]">Never share your API key with anyone else.</p>
      </div>

      <button
        onClick={() => {
          void handleTestConnection();
        }}
        disabled={!apiKey.trim() || testing}
        className={[
          "flex h-14 w-full items-center justify-center gap-2 rounded-full border-0 text-base font-bold tracking-[-0.2px] text-white",
          testResult === "success"
            ? "bg-[linear-gradient(180deg,#16a34a_0%,#15803d_100%)]"
            : "bg-[linear-gradient(180deg,#ba0034_0%,#e51245_100%)]",
          !apiKey.trim() || testing ? "cursor-not-allowed opacity-60" : "cursor-pointer opacity-100",
        ].join(" ")}
      >
        {testing ? (
          <Loader2 className="size-[18px] animate-spin" />
        ) : testResult === "success" ? (
          <CheckCircle className="size-[18px]" />
        ) : (
          <svg width="14" height="20" viewBox="0 0 14 20" fill="none">
            <path d="M8 1L1 11h6l-1 8 7-10H7L8 1z" fill="white" />
          </svg>
        )}
        {testing ? "Testing..." : testResult === "success" ? "Connected!" : "Test Connection"}
      </button>

      {testResult === "error" && (
        <div className="flex items-center gap-1.5 text-red-500">
          <XCircle className="size-4" />
          <span className="text-[13px] font-semibold">{testError ?? "Connection failed"}</span>
        </div>
      )}

      {testResult === "success" && (
        <button
          id="__apikey-auto-next"
          className="hidden"
          onClick={onNext}
        />
      )}
    </div>
  );
}
