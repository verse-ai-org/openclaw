interface WizardFooterProps {
  onBack: () => void;
  onNext: () => void;
  canProceed: boolean;
  /** Current step index (1-based) */
  current: number;
  /** Total step count */
  total: number;
}

/** Arrow-left icon (16×16) matching Figma design */
function IconArrowLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Arrow-right icon (9.3×9.3) matching Figma design */
function IconArrowRight() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M3 8L7 5L3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Step progress dots — matches Figma "Container" node (160:76):
 * - 8×8 circle dots, gap 3 (12px)
 * - inactive: zinc-200 (#e4e4e7)
 * - active (current): [#8e0025] wide pill (w-10)
 */
function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-3">
      {Array.from({ length: total }).map((_, i) => {
        const isActive = i === current - 1;
        return (
          <div
            key={i}
            className={[
              "h-2 rounded-full transition-all duration-[250ms] ease-in-out",
              isActive ? "w-10 bg-[#8e0025]" : "w-2 bg-zinc-200",
            ].join(" ")}
          />
        );
      })}
    </div>
  );
}

/**
 * Wizard bottom navigation footer — strictly matches Figma "Footer - Bottom Navigation Shell" (160:69).
 *
 * Layout: Back (left) | Step dots (center) | Continue (right)
 */
export function WizardFooter({ onBack, onNext, canProceed, current, total }: WizardFooterProps) {
  return (
    <footer className="fixed bottom-0 left-0 right-0 h-32 flex items-center justify-between px-12 z-40 backdrop-blur-md">
      {/* Back button — matches Figma node 160:70 */}
      <button
        onClick={onBack}
        className="flex flex-row items-center gap-1 px-6 py-4 bg-transparent border-none cursor-pointer text-zinc-500 hover:text-zinc-700 transition-colors min-w-[80px]"
      >
        <IconArrowLeft />
        <span className="text-sm font-medium leading-none">Back</span>
      </button>

      {/* Step progress dots — matches Figma node 160:76 */}
      <StepDots current={current} total={total} />

      {/* Continue button — matches Figma node 160:81 */}
      <button
        onClick={canProceed ? onNext : undefined}
        disabled={!canProceed}
        className={[
          "flex items-center justify-center gap-2 h-12 px-10 rounded-full border-none text-sm font-medium transition-opacity duration-150",
          canProceed
            ? "bg-linear-to-b from-red-600 to-red-500 text-white cursor-pointer shadow-[0_4px_6px_rgba(220,38,38,0.18),0_10px_15px_rgba(220,38,38,0.10)]"
            : "bg-zinc-200 text-zinc-400 cursor-not-allowed opacity-60",
        ].join(" ")}
      >
        <span>Continue</span>
        <IconArrowRight />
      </button>
    </footer>
  );
}
