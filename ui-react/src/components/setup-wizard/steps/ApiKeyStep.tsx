import { ExternalLink, Key, CheckCircle, XCircle, Shield, Loader2 } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { findAuthMethod, findProviderGroupForMethod } from "@/data/auth-choice-groups";
import { useWizardStore } from "@/store/setup-wizard.store";
import { useWizardAdapter } from "@/context/AdapterContext";

interface ApiKeyStepProps {
  onNext: () => void;
  onBack: () => void;
}

// ─── OAuth flow UI ─────────────────────────────────────────────────────────

function OAuthFlow({
  methodLabel, hint, onComplete,
}: { methodLabel: string; hint?: string; onComplete: () => void }) {
  const [waiting, setWaiting] = useState(false);
  return (
    <div className="space-y-8">
      <div className="text-center space-y-4 pt-12">
        <h1 className="text-4xl font-extrabold tracking-tighter text-slate-900 dark:text-white">Authenticate with {methodLabel}</h1>
        {hint && <p className="text-lg text-slate-500 dark:text-slate-400 max-w-md mx-auto">{hint}</p>}
      </div>
      <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex items-start gap-6">
          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg flex-shrink-0">1</div>
          <div className="space-y-3">
            <h3 className="text-xl font-bold">Open browser to authenticate</h3>
            <p className="text-slate-500 dark:text-slate-400">Click the button below, complete sign-in, then return here.</p>
            <button onClick={() => setWaiting(true)} className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white font-bold rounded-full hover:opacity-90">
              <ExternalLink className="w-4 h-4" /> Open Authentication Page
            </button>
          </div>
        </div>
        {waiting && (
          <div className="flex items-start gap-6 border-t border-slate-100 dark:border-slate-800 pt-6">
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg flex-shrink-0">2</div>
            <div className="space-y-3">
              <h3 className="text-xl font-bold">Complete in browser, then continue</h3>
              <button onClick={onComplete} className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-full hover:opacity-90">
                <CheckCircle className="w-4 h-4" /> I&#39;ve authenticated — continue
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── API-key flow UI ───────────────────────────────────────────────────────

export function ApiKeyStep({ onNext, onBack: _onBack }: ApiKeyStepProps) {
  const { wizardState, updateWizardState } = useWizardStore();
  const adapter = useWizardAdapter();

  const { authMethod: authMethodId, authProviderGroup } = wizardState;

  // Resolve metadata from the static catalog
  const methodDef = findAuthMethod(authMethodId);
  const groupDef = findProviderGroupForMethod(authMethodId);
  const isOAuth = methodDef?.type === "oauth";

  const providerLabel = groupDef?.label ?? authProviderGroup;
  const consoleUrl = methodDef?.consoleUrl ?? "";
  const keyPlaceholder = methodDef?.keyPlaceholder ?? "Paste your API key...";

  const [apiKey, setApiKey] = useState(wizardState.apiKey || "");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // OAuth path — delegate to OAuthFlow
  if (isOAuth) {
    return (
      <OAuthFlow
        methodLabel={methodDef?.label ?? authMethodId}
        hint={methodDef?.hint}
        onComplete={() => {
          updateWizardState({ apiKey: "" });
          onNext();
        }}
      />
    );
  }

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
        const result = await adapter.validateApiKey(authMethodId, trimmed);
        if (result.ok) {
          updateWizardState({ apiKey: trimmed });
          setTestResult("success");
        } else {
          setTestResult("error");
          setTestError(result.error ?? "Validation failed.");
        }
      } else {
        // Fallback: basic non-empty check
        updateWizardState({ apiKey: trimmed });
        setTestResult("success");
      }
    } catch (err) {
      setTestResult("error");
      setTestError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="text-center space-y-4 pt-12">
        <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tighter text-slate-900 dark:text-white">
          Connect your {providerLabel} account
        </h1>
        <p className="text-lg text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          An API key is required to use {providerLabel}. It only takes a moment.
        </p>
      </div>

      {/* 3-Step Guide Container */}
      <div className="space-y-8">
        {/* Step 1: External Link */}
        {consoleUrl && (
          <div className="relative group bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-primary/5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start gap-6">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                1
              </div>
              <div className="flex-1 space-y-4">
                <div>
                  <h3 className="text-xl font-bold">Get your API key</h3>
                  <p className="text-slate-500 dark:text-slate-400 mt-1">
                    Open the {providerLabel} console to create or copy your key.
                  </p>
                </div>
                <a
                  href={consoleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white font-bold rounded-full hover:opacity-90 transition-opacity"
                >
                  <span>Open Console</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Input Field */}
        <div className="relative group bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-primary/5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
              {consoleUrl ? 2 : 1}
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="text-xl font-bold">Paste your key</h3>
                <p className="text-slate-500 dark:text-slate-400 mt-1">
                  Your key is stored securely on your device.
                </p>
              </div>
              <div className="relative max-w-md">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                  <Key className="w-5 h-5" />
                </div>
                <Input
                  type={showKey ? "text" : "password"}
                  placeholder={keyPlaceholder}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setTestResult(null);
                    setTestError(null);
                  }}
                  className="pl-12 pr-4 py-4 bg-slate-50 dark:bg-background-dark border-none rounded-2xl focus:ring-2 focus:ring-primary text-slate-900 dark:text-white placeholder:text-slate-400"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showKey}
                  onChange={(e) => setShowKey(e.target.checked)}
                  className="rounded border-slate-300 text-primary focus:ring-primary"
                />
                <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                  Show key
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Step 3: Test + Continue */}
        <div className="relative group bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-primary/5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
              {consoleUrl ? 3 : 2}
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="text-xl font-bold">Test connection</h3>
                <p className="text-slate-500 dark:text-slate-400 mt-1">
                  We&#39;ll perform a quick handshake to make sure your key works.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  onClick={handleTestConnection}
                  disabled={!apiKey.trim() || testing}
                  className="px-8 py-3 bg-slate-900 dark:bg-primary text-white font-bold rounded-full hover:scale-105 active:scale-95 transition-transform flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Testing...</span>
                    </>
                  ) : (
                    <span>Test Connection</span>
                  )}
                </button>

                {testResult === "success" && (
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-semibold">Connected</span>
                  </div>
                )}

                {testResult === "error" && (
                  <div className="flex items-center gap-2 text-red-500 dark:text-red-400">
                    <XCircle className="w-5 h-5" />
                    <span className="font-semibold">{testError ?? "Connection failed"}</span>
                  </div>
                )}
              </div>

              {/* Continue button — only shown after successful test */}
              {testResult === "success" && (
                <div className="pt-2">
                  <button
                    onClick={onNext}
                    className="px-10 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-full hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                  >
                    <CheckCircle className="w-5 h-5" />
                    <span>Continue</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="text-center pt-12">
        <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest font-semibold flex items-center justify-center gap-2">
          <Shield className="w-4 h-4" />
          Privacy First Architecture
        </p>
      </div>
    </div>
  );
}
