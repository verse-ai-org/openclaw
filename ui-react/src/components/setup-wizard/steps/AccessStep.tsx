import { ArrowRight, Loader2, CheckCircle, XCircle } from "lucide-react";
import { useState } from "react";
import { useWizardAdapter } from "@/context/AdapterContext";
import { useWizardStore } from "@/store/setup-wizard.store";
import { isValidInviteCodeFormat } from "@/lib/invite-code";

interface AccessStepProps {
  onNextInvite?: () => void;
  onNextManual: () => void;
  onVerificationChange?: (verified: boolean) => void;
}

export function AccessStep({onNextManual, onVerificationChange }: AccessStepProps) {
  const adapter = useWizardAdapter();
  const { updateWizardState } = useWizardStore();
  const [inviteCode, setInviteCode] = useState("");
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<"success" | "error" | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  const handleValidateInviteCode = async () => {
    const trimmed = inviteCode.trim();
    if (!trimmed) {
      setValidationError("Invite code cannot be empty.");
      setValidationResult("error");
      return;
    }

    // Strict format check before hitting the network.
    if (!isValidInviteCodeFormat(trimmed)) {
      setValidationError("Invalid invite code format. Expected: BOSS-XXXX-XXXX");
      setValidationResult("error");
      return;
    }

    setValidating(true);
    setValidationResult(null);
    setValidationError(null);

    try {
      if (adapter.validateInviteCode) {
        const result = await adapter.validateInviteCode(trimmed);
        if (result.ok && result.apiKey && result.model) {
          // Write results into wizard store so subsequent steps and completion
          // can use the resolved model + api key without manual entry.
          updateWizardState({
            apiKey: result.apiKey,
            resolvedModelId: result.model,
            // Derive a best-effort provider group from the model prefix (e.g. "anthropic/..." => "anthropic")
            authProviderGroup: result.model.split("/")[0] ?? "anthropic",
            authMethod: "apiKey",
            usedInviteCode: true,
          });
          setValidationResult("success");
          setValidationError(null);
          setIsVerified(true);
          onVerificationChange?.(true);
        } else {
          setValidationResult("error");
          setValidationError(result.error ?? "Validation failed.");
          setIsVerified(false);
          onVerificationChange?.(false);
        }
      } else {
        setValidationResult("error");
        setValidationError("Invite code validation not available.");
        setIsVerified(false);
        onVerificationChange?.(false);
      }
    } catch (err) {
      setValidationResult("error");
      setValidationError(err instanceof Error ? err.message : "Unexpected error.");
      setIsVerified(false);
      onVerificationChange?.(false);
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-[#eeeef0]">
      {/* Hero area with radial pink gradient + key icon */}
      <div className="w-full max-w-xl flex flex-col items-center text-center gap-6">
        {/* Step label */}
        <p className="text-xs font-bold tracking-[0.18em] uppercase text-[rgba(186,0,52,1)]">
          STEP 2 OF 4
        </p>

        {/* Key icon in white circle */}
        {/* <div
          className="size-20 rounded-full flex items-center justify-center mb-8 shadow-sm"
          style={{ background: "#ffffff" }}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(186,0,52,1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7.5" cy="15.5" r="5.5" />
            <path d="m21 2-9.6 9.6" />
            <path d="m15.5 7.5 3 3L22 7l-3-3" />
          </svg>
        </div> */}

        {/* Header */}
        <div className="flex flex-col gap-3">
          {/* Title */}
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900">
            <span className="text-[rgba(26,28,29,1)]">Unlock </span>
            <span className="text-[rgba(186,0,52,1)]">Bossim</span>
          </h1>
          {/* Subtitle */}
          <p className="text-slate-500 text-base leading-relaxed px-4">
            Enter your invitation code to get started with your pre-configured
            model.
          </p>
        </div>
      </div>

      {/* Card */}
      <div className="flex w-full max-w-xl flex-col items-center px-6 py-6">
        <div className="w-full rounded-3xl p-6 flex flex-col gap-6 bg-[rgba(255,255,255,0.85)] shadow-[0px_2px_24px_rgba(0,0,0,0.06)]">
          {/* Input */}
          <input
            type="text"
            placeholder="XXXX - XXXX - XXXX"
            value={inviteCode}
            onChange={(e) => {
              setInviteCode(e.target.value.toUpperCase());
              if (validationResult || validationError) {
                setValidationResult(null);
                setValidationError(null);
                setIsVerified(false);
                onVerificationChange?.(false);
              }
            }}
            disabled={validating}
            className="w-full px-5 py-4 rounded-full text-center text-base tracking-widest placeholder-slate-400 focus:outline-none focus:ring-2 disabled:opacity-50"
            style={{
              background: "rgba(235,235,240,1)",
              border: "none",
              color: "rgba(26,28,29,1)",
            }}
          />

          {/* Validation feedback */}
          {validationResult === "success" && (
            <div className="flex items-center gap-2 text-emerald-600 p-3 bg-emerald-50 rounded-2xl">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span className="font-semibold text-sm">
                Code verified successfully!
              </span>
            </div>
          )}
          {validationResult === "error" && validationError && (
            <div className="flex items-start gap-2 text-red-600 p-3 bg-red-50 rounded-2xl">
              <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="text-sm">{validationError}</span>
            </div>
          )}

          {/* Verify Code button */}
          <button
            onClick={handleValidateInviteCode}
            disabled={
              !inviteCode.trim() || validating || isVerified
            }
            className="w-full py-4 rounded-full font-bold text-white text-base transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{
              background:
                "linear-gradient(135deg, rgba(186,0,52,1) 0%, rgba(140,0,40,1) 100%)",
            }}
          >
            {validating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying...
              </>
            ) : isVerified ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Verified
              </>
            ) : (
              "Verify Code"
            )}
          </button>

          {/* Divider OR */}
          <div className="flex items-center justify-center">
            <span
              className="text-xs tracking-widest"
              style={{ color: "rgba(150,150,158,1)" }}
            >
              OR
            </span>
          </div>

          {/* Manually Select a Model */}
          <button
            onClick={onNextManual}
            className="flex items-center justify-center gap-1 font-semibold text-sm transition-opacity hover:opacity-70"
            style={{ color: "rgba(26,28,29,1)" }}
          >
            Manually Select a Model
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Help link */}
        <p className="mt-6 text-sm" style={{ color: "rgba(150,150,158,1)" }}>
          Need help?{" "}
          <button
            className="font-semibold hover:underline"
            style={{ color: "rgba(186,0,52,1)" }}
          >
            Contact system administrator
          </button>
        </p>
      </div>
    </div>
  );
}
