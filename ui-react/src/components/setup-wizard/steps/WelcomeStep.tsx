import { Target, RefreshCw, Rocket, ChevronRight } from "lucide-react";

interface WelcomeStepProps {
  onNext: () => void;
}

const GRID_CARDS = [
  { icon: Target, label: "TARGET" },
  { icon: RefreshCw, label: "SYNC" },
  { icon: Rocket, label: "LAUNCH" },
];

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="relative w-full min-h-screen flex flex-col overflow-hidden bg-[#eeeef0]">
      {/* Cinematic radial gradient backdrop */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: [
            "radial-gradient(ellipse 70% 50% at 50% 40%, rgba(186,0,52,0.10) 0%, transparent 70%)",
          ].join(", "),
        }}
      />

      {/* Header - Minimal Top Bar */}
      <header className="relative z-10 flex items-center justify-end px-8 py-5">
        <div className="flex items-center gap-4">
          <button className="text-zinc-400 hover:text-zinc-600 transition-colors p-1">
            {/* Help / ? icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
            </svg>
          </button>
          <button className="text-zinc-400 hover:text-zinc-600 transition-colors p-1">
            {/* Settings gear icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main - Immersive Canvas */}
      <main className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 gap-12">
        {/* Small cube icon */}
        <div style={{ color: "rgba(186,0,52,1)" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        </div>

        {/* Hero Title */}
        <div className="text-center">
          <h1
            className="font-black leading-none tracking-tight uppercase"
            style={{ fontSize: "clamp(56px, 8vw, 100px)" }}
          >
            <span style={{ color: "rgba(26,28,29,1)" }}>INITIATE </span>
            <span style={{ color: "rgba(186,0,52,1)" }}>OPENCLAW</span>
          </h1>
          <p
            className="mt-4 tracking-[0.25em] uppercase font-medium"
            style={{ fontSize: "13px", color: "rgba(150,150,158,1)" }}
          >
            AUTOMATE. SYNCHRONIZE. CONTROL.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="flex gap-3">
          {GRID_CARDS.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-full px-6 py-3 border border-white/60"
              style={{ background: "rgba(255,255,255,0.55)" }}
            >
              <Icon className="w-4 h-4" style={{ color: "rgba(186,0,52,1)" }} />
              <span
                className="font-bold text-[11px] tracking-[0.15em]"
                style={{ color: "rgba(90,90,98,1)" }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={onNext}
            className="flex items-center gap-2 rounded-full px-12 py-4 font-black text-sm tracking-[0.12em] uppercase transition-opacity hover:opacity-90"
            style={{ background: "rgba(255,255,255,0.9)", color: "rgba(26,28,29,1)", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}
          >
            START SETUP
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            onClick={onNext}
            className="tracking-[0.18em] uppercase transition-colors hover:text-zinc-900"
            style={{ fontSize: "10px", color: "rgba(150,150,158,1)" }}
          >
            ACCESS COMMAND CENTER
          </button>
        </div>
      </main>
    </div>
  );
}
