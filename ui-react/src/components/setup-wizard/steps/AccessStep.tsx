import { ArrowRight, Loader2, CheckCircle, XCircle, ChevronRight } from "lucide-react";
import { useState } from "react";
import { GlassCard } from "../GlassCard";
import { useWizardAdapter } from "@/context/AdapterContext";
import { useWizardStore } from "@/store/setup-wizard.store";

interface AccessStepProps {
  onNextInvite: () => void;
  onNextManual: () => void;
  onBack: () => void;
}

type AccessMode = "choice" | "invite" | "manual";

export function AccessStep({ onNextInvite, onNextManual, onBack }: AccessStepProps) {
  const adapter = useWizardAdapter();
  const { updateWizardState } = useWizardStore();
  const [mode, setMode] = useState<AccessMode>("choice");
  const [inviteCode, setInviteCode] = useState("");
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<"success" | "error" | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleValidateInviteCode = async () => {
    const trimmed = inviteCode.trim();
    if (!trimmed) {
      setValidationError("Invite code cannot be empty.");
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
          // Auto-advance after brief success display
          setTimeout(() => onNextInvite(), 800);
        } else {
          setValidationResult("error");
          setValidationError(result.error ?? "Validation failed.");
        }
      } else {
        setValidationResult("error");
        setValidationError("Invite code validation not available.");
      }
    } catch (err) {
      setValidationResult("error");
      setValidationError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setValidating(false);
    }
  };

  const handleSwitchToManual = () => {
    setMode("manual");
    // Ensure usedInviteCode is false for manual path
    updateWizardState({ usedInviteCode: false });
    // Trigger manual path navigation
    setTimeout(() => onNextManual(), 300);
  };

  // ── Choice screen: two options ─────────────────────────────────────────
  if (mode === "choice") {
    return (
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tighter text-slate-900 dark:text-slate-50">
            Get Started
          </h1>
          <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed mx-auto">
            Choose how you want to set up your AI assistant.
          </p>
        </div>

        {/* Two option cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Option 1: Invite Code */}
          <button
            onClick={() => setMode("invite")}
            className="group relative flex flex-col overflow-hidden rounded-xl bg-white dark:bg-slate-900 shadow-sm transition-all hover:shadow-xl hover:-translate-y-1 border border-slate-100 dark:border-slate-800 text-left"
          >
            <div className="relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 opacity-90 group-hover:scale-110 transition-transform duration-500" />
            <div className="flex flex-1 flex-col p-6">
              <span className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                Quick Start
              </span>
              <h3 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
                Use Invite Code
              </h3>
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400 flex-1">
                Have an invite code? Enter it to instantly get your API key and model configuration.
              </p>
              <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <span className="flex h-9 items-center justify-center rounded-full bg-emerald-600 px-6 text-sm font-bold text-white shadow-md shadow-emerald-600/30 group-hover:bg-emerald-700 transition-colors">
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </span>
              </div>
            </div>
          </button>

          {/* Option 2: Manual Configuration */}
          <button
            onClick={handleSwitchToManual}
            className="group relative flex flex-col overflow-hidden rounded-xl bg-white dark:bg-slate-900 shadow-sm transition-all hover:shadow-xl hover:-translate-y-1 border border-slate-100 dark:border-slate-800 text-left"
          >
            <div className="relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-slate-400 via-slate-500 to-slate-600 opacity-90 group-hover:scale-110 transition-transform duration-500" />
            <div className="flex flex-1 flex-col p-6">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-400">
                Manual Setup
              </span>
              <h3 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
                Configure Provider
              </h3>
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400 flex-1">
                Choose your AI provider and enter your API key manually for full control.
              </p>
              <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <span className="flex h-9 items-center justify-center rounded-full bg-slate-600 px-6 text-sm font-bold text-white shadow-md shadow-slate-600/30 group-hover:bg-slate-700 transition-colors">
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </span>
              </div>
            </div>
          </button>
        </div>

        {/* Back button */}
        <div className="flex justify-center pt-4">
          <button
            onClick={onBack}
            className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ── Invite code screen ─────────────────────────────────────────────────
  if (mode === "invite") {
    return (
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tighter text-slate-900 dark:text-slate-50">
            Enter Your Invite Code
          </h1>
          <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed mx-auto">
            Paste your invite code to get instant access to your AI model and API configuration.
          </p>
        </div>

        {/* Input card */}
        <GlassCard className="w-full max-w-md mx-auto">
          <div className="space-y-6 p-6">
            {/* Input field */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-900 dark:text-white">
                Invite Code
              </label>
              <input
                type="text"
                placeholder="BOSS-XXXX-XXXX"
                value={inviteCode}
                onChange={(e) => {
                  setInviteCode(e.target.value.toUpperCase());
                  if (validationResult || validationError) {
                    setValidationResult(null);
                    setValidationError(null);
                  }
                }}
                disabled={validating}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              />
            </div>

            {/* Validation result */}
            {validationResult === "success" && (
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
                <span className="font-semibold">Code verified successfully!</span>
              </div>
            )}

            {validationResult === "error" && validationError && (
              <div className="flex items-start gap-2 text-red-500 dark:text-red-400 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span className="text-sm">{validationError}</span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={handleValidateInviteCode}
                disabled={!inviteCode.trim() || validating || validationResult === "success"}
                className="flex-1 px-6 py-3 bg-primary text-white font-bold rounded-full hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {validating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    Verify Code
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

            {/* Switch to manual */}
            <button
              onClick={() => setMode("choice")}
              className="w-full text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors py-2"
            >
              ← Back to options
            </button>
          </div>
        </GlassCard>
      </div>
    );
  }

  return null;
}
