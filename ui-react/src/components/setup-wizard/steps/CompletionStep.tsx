import { useState } from "react";
import { useWizardStore } from "@/store/setup-wizard.store";
import { useOptionalWizardAdapter } from "@/context/AdapterContext";
import { findAuthMethod, findProviderGroupForMethod } from "@/data/auth-choice-groups";

// Emoji map for providers (mirrors ApiKeyStep)
const PROVIDER_EMOJI: Record<string, string> = {
  anthropic: "🟠",
  openai: "⚫",
  google: "🔵",
  mistral: "🟣",
  xai: "⬛",
  "azure-openai": "🔷",
  moonshot: "🌙",
  groq: "⚡",
  openrouter: "🔀",
};

interface CompletionStepProps {
  onBack: () => void;
}

export function CompletionStep(_props: CompletionStepProps) {
  const { wizardState } = useWizardStore();
  const adapter = useOptionalWizardAdapter();
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const handleStartChat = async () => {
    if (isStarting) {
      return;
    }
    setIsStarting(true);
    setStartError(null);

    if (adapter) {
      // Electron: use complete() to persist config + restart Gateway + switch window.
      // complete() bypasses the Gateway WizardSession entirely (which would block
      // waiting for step-by-step answers), going straight to saveOnboardingConfig.
      try {
        if (typeof adapter.complete === "function") {
          await adapter.complete();
        } else {
          await adapter.submitStep({ action: "complete" });
        }
      } catch (err) {
        console.error("[CompletionStep] adapter.complete failed:", err);
        setStartError("Failed to start OpenClaw. Please try again.");
        setIsStarting(false);
      }
    } else {
      // Web / no-adapter fallback
      setTimeout(() => {
        window.location.href = "/chat";
      }, 500);
    }
  };

  // Resolve provider and model display info
  const { authMethod: authMethodId, resolvedModelId } = wizardState;
  const methodDef = findAuthMethod(authMethodId);
  const groupDef = findProviderGroupForMethod(authMethodId);
  const providerLabel = groupDef?.label ?? "AI Provider";
  const providerEmoji = PROVIDER_EMOJI[groupDef?.id ?? ""] ?? "🤖";
  const modelName = resolvedModelId ?? methodDef?.defaultModelId ?? "AI Model";

  // Static feature list for the bento card (design: 3 bullet points)
  const features = [
    { label: "Recursive Debugging", active: true },
    { label: "Memory Persistence", active: true },
    { label: "API Shielding", active: false },
  ];

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[rgb(249,249,251)] px-6 pt-8">
      {/* ── Main content container ── */}
      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center">
        {/* ── Success Animation: icon + heading + subtitle ── */}
        <div className="mb-12 flex w-full flex-col items-center">
          {/* Icon circle */}
          <div className="mb-8 flex h-32 w-32 shrink-0 items-center justify-center rounded-full bg-[rgb(186,0,52)]">
            {/* Checkmark SVG — matches design vector icon */}
            <svg width="65" height="65" viewBox="0 0 65 65" fill="none">
              <path
                d="M13 34L27 48L52 20"
                stroke="white"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Heading */}
          <h1 className="m-0 text-[56px] font-extrabold leading-none tracking-[-1.5px] text-[rgb(26,28,29)]">
            All set.
          </h1>

          {/* Subtitle */}
          <p className="mt-4 text-center text-lg font-normal leading-relaxed text-[rgb(91,64,65)]">
            Your Bossim environment is ready to power your
            <br />
            next generation of intelligent workflows.
          </p>
        </div>

        {/* ── Summary Bento Grid ── */}
        <div className="mb-8 grid w-full max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
          {/* Provider Card */}
          <div className="flex min-h-60 flex-col gap-3 rounded-[48px] bg-white p-10 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            {/* Header row: icon + label */}
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[rgb(243,243,245)] text-[22px]">
                {providerEmoji}
              </div>
              <span className="text-xs font-semibold tracking-[0.2px] text-[rgb(91,64,65)]">
                Active Provider
              </span>
            </div>

            {/* Model name */}
            <div className="text-[30px] font-bold leading-tight tracking-[-0.5px] text-[rgb(26,28,29)]">
              {modelName}
            </div>

            {/* Status row: green dot + description */}
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 shrink-0 rounded-full bg-[rgb(0,79,55)]" />
              <span className="text-sm font-normal text-[rgb(91,64,65)]">
                {providerLabel} · Connected
              </span>
            </div>
          </div>

          {/* Features Card */}
          <div className="flex min-h-60 flex-col gap-6 rounded-[48px] bg-white p-10 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            {/* Header row: icon + label */}
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[rgb(243,243,245)]">
                {/* Spark / features icon */}
                <svg width="22" height="21" viewBox="0 0 22 21" fill="none">
                  <path
                    d="M11 1L13.5 8H21L15 12.5L17.5 19.5L11 15L4.5 19.5L7 12.5L1 8H8.5L11 1Z"
                    fill="rgb(0,79,55)"
                  />
                </svg>
              </div>
              <span className="text-xs font-semibold tracking-[0.2px] text-[rgb(91,64,65)]">
                Enabled Features
              </span>
            </div>

            {/* Feature list */}
            <div className="flex flex-col gap-3">
              {features.map((f) => (
                <div key={f.label} className="flex items-center gap-3">
                  {/* Checkmark icon — green when active, muted when inactive */}
                  <svg width="10" height="7" viewBox="0 0 10 7" fill="none" className="shrink-0">
                    <path
                      d="M1 3.5L4 6.5L9 1"
                      stroke={f.active ? "rgb(0,79,55)" : "rgb(91,64,65)"}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span
                    className={[
                      "text-base font-medium",
                      f.active ? "text-[rgb(26,28,29)]" : "text-[rgb(91,64,65)]",
                    ].join(" ")}
                  >
                    {f.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Primary CTA ── */}
        <div className="flex w-full max-w-96 flex-col items-center gap-4">
          <button
            onClick={handleStartChat}
            disabled={isStarting}
            className={[
              "flex h-20 w-full items-center justify-center gap-3 rounded-full border-0",
              "bg-[linear-gradient(90deg,rgb(186,0,52)_0%,rgb(222,41,74)_100%)]",
              "shadow-[0_8px_32px_rgba(186,0,52,0.28)] transition-opacity",
              isStarting
                ? "cursor-wait opacity-85"
                : "cursor-pointer opacity-100 hover:opacity-90",
            ].join(" ")}
          >
            <span className="text-xl font-bold tracking-[-0.3px] text-white">
              {isStarting ? "Starting Bossim..." : "Start Chatting"}
            </span>
            {isStarting ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="rgba(255,255,255,0.35)"
                  strokeWidth="3"
                />
                <path
                  d="M21 12a9 9 0 0 0-9-9"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                >
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 12 12"
                    to="360 12 12"
                    dur="0.8s"
                    repeatCount="indefinite"
                  />
                </path>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 8H13M13 8L9 4M13 8L9 12"
                  stroke="white"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>

          {/* {isStarting && (
            <p className="m-0 text-center text-[13px] font-medium text-[rgb(91,64,65)]">
              Initializing gateway and finalizing setup. This may take a few seconds.
            </p>
          )} */}

          {startError && (
            <p className="m-0 text-center text-[13px] font-semibold text-[rgb(186,0,52)]">
              {startError}
            </p>
          )}

        </div>
      </div>
    </div>
  );
}
