import { ExternalLink, CheckCircle, XCircle, Loader2, RefreshCw } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { findProviderGroupForMethod } from "@/data/auth-choice-groups";
import { useWizardAdapter } from "@/context/AdapterContext";

type OAuthPhase = "idle" | "opening" | "polling" | "success" | "error";

export interface OAuthContentProps {
  methodId: string;
  methodLabel: string;
  hint?: string;
  onComplete: (token: string, refresh?: string, expires?: number) => void;
}

export function OAuthContent({
  methodId,
  methodLabel,
  hint,
  onComplete,
}: OAuthContentProps) {
  const adapter = useWizardAdapter();
  const [phase, setPhase] = useState<OAuthPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [deviceCode, setDeviceCode] = useState<{ userCode: string; verificationUri: string } | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      void adapter.cancelOAuth?.(methodId);
    };
  }, [adapter, methodId]);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const startPolling = () => {
    pollIntervalRef.current = setInterval(async () => {
      if (!adapter.pollOAuth) {
        stopPolling();
        return;
      }
      try {
        const result = await adapter.pollOAuth(methodId);
        if (result.ok) {
          stopPolling();
          setPhase("success");
          setTimeout(() => onComplete(result.token ?? "", result.refresh, result.expires), 600);
        } else if (result.error === "pending") {
          // Still waiting — keep polling
        } else if (result.error === "timeout") {
          stopPolling();
          setPhase("error");
          setError("Authentication timed out. Please try again.");
        } else {
          stopPolling();
          setPhase("error");
          setError(result.error ?? "Authentication failed.");
        }
      } catch (err) {
        stopPolling();
        setPhase("error");
        setError(err instanceof Error ? err.message : "Unexpected error.");
      }
    }, 2000);
  };

  const handleOpenBrowser = async () => {
    setPhase("opening");
    setError(null);
    setDeviceCode(null);
    try {
      if (adapter.startOAuth) {
        const result = await adapter.startOAuth(methodId);
        if (!result.ok) {
          setPhase("error");
          setError(result.error ?? "Failed to open browser.");
          return;
        }
        if (result.userCode && result.verificationUri) {
          setDeviceCode({ userCode: result.userCode, verificationUri: result.verificationUri });
        }
      }
      setPhase("polling");
      startPolling();
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Unexpected error.");
    }
  };

  const handleManualContinue = () => {
    stopPolling();
    setPhase("success");
    setTimeout(() => onComplete(""), 300);
  };

  const handleRetry = async () => {
    stopPolling();
    await adapter.cancelOAuth?.(methodId);
    setPhase("idle");
    setError(null);
  };

  const group = findProviderGroupForMethod(methodId);
  const providerName = group?.label ?? methodLabel;

  return (
    <div className="flex flex-col gap-6">
      <p className="m-0 text-sm font-medium leading-[1.6] text-zinc-500">
        {hint ??
          `Securely connect to ${providerName} via OAuth. This allows OpenClaw to interact with your models without storing permanent credentials.`}
      </p>

      <button
        onClick={() => {
          void handleOpenBrowser();
        }}
        disabled={phase === "opening" || phase === "success"}
        className={[
          "flex h-14 w-full items-center justify-center gap-2 rounded-full border-0 text-base font-bold tracking-[-0.2px] text-white",
          phase === "success"
            ? "bg-[linear-gradient(180deg,#16a34a_0%,#15803d_100%)]"
            : "bg-[linear-gradient(180deg,#ba0034_0%,#de294a_100%)]",
          phase === "opening" || phase === "success" ? "cursor-not-allowed" : "cursor-pointer",
          phase === "opening" ? "opacity-70" : "opacity-100",
        ].join(" ")}
      >
        {phase === "opening" && <Loader2 className="size-[18px] animate-spin" />}
        {phase === "success" && <CheckCircle className="size-[18px]" />}
        {phase !== "opening" && phase !== "success" && (
          <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
            <rect x="2" y="8" width="12" height="11" rx="2" fill="white" opacity="0.9" />
            <path d="M5 8V5.5a3 3 0 0 1 6 0V8" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
        )}
        {phase === "opening" ? "Opening..." : phase === "success" ? "Authenticated!" : "Authenticate Now"}
      </button>

      {(phase === "polling" || phase === "error") && (
        <div className="flex flex-col gap-3">
          {phase === "polling" && (
            <>
              {deviceCode && (
                <div className="rounded-xl bg-zinc-100 px-4 py-3">
                  <p className="mb-1 mt-0 text-xs text-zinc-500">If prompted, enter this code in the browser:</p>
                  <p className="mb-1 mt-0 font-mono text-[22px] font-bold tracking-[4px] text-[#1a1c1d]">{deviceCode.userCode}</p>
                  <a
                    href={deviceCode.verificationUri}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#ba0034]"
                  >
                    <ExternalLink className="size-3" />
                    {deviceCode.verificationUri}
                  </a>
                </div>
              )}
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="size-[14px] animate-spin text-[#ba0034]" />
                <span className="text-[11px] font-semibold uppercase tracking-[1px] text-zinc-400">
                  Waiting for confirmation...
                </span>
              </div>
              {!adapter.pollOAuth && (
                <button
                  onClick={handleManualContinue}
                  className="cursor-pointer border-0 bg-transparent text-[13px] font-semibold text-green-600"
                >
                  I&#39;ve authenticated — continue
                </button>
              )}
            </>
          )}
          {phase === "error" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-red-500">
                <XCircle className="size-4" />
                <span className="text-sm font-semibold">{error ?? "Authentication failed."}</span>
              </div>
              <button
                onClick={() => {
                  void handleRetry();
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent text-[13px] font-semibold text-zinc-500"
              >
                <RefreshCw className="size-[14px]" />
                Try again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
