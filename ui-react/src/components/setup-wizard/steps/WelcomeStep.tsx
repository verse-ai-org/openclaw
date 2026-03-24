import { Target, RefreshCw, Rocket, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WelcomeStepProps {
  onNext: () => void;
}

const GRID_CARDS = [
  { icon: Target, label: "Target" },
  { icon: RefreshCw, label: "Sync" },
  { icon: Rocket, label: "Launch" },
];

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="relative w-full min-h-screen flex flex-col overflow-hidden bg-[#f8f5f6]">
      {/* Cinematic radial gradient backdrop */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: [
            "radial-gradient(ellipse 80% 60% at 20% 10%, rgba(186,0,52,0.12) 0%, transparent 70%)",
            "radial-gradient(ellipse 60% 80% at 80% 80%, rgba(186,0,52,0.08) 0%, transparent 70%)",
            "radial-gradient(ellipse 100% 100% at 50% 50%, rgba(248,245,246,0.95) 0%, transparent 100%)",
          ].join(", "),
        }}
      />

      {/* Header - Minimal Top Bar */}
      <header className="relative z-10 flex items-center justify-between px-12 py-8">
        <span
          className="text-xl font-black tracking-tight"
          style={{ color: "rgba(186,0,52,1)" }}
        >
          OpenClaw
        </span>
        <div className="flex items-center gap-8">
          <button className="text-zinc-500 hover:text-zinc-700 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </button>
          <button className="text-zinc-500 hover:text-zinc-700 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 20V10" />
              <path d="M12 20V4" />
              <path d="M6 20v-6" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main - Immersive Canvas */}
      <main className="relative z-10 flex flex-col items-center flex-1 px-6">
        {/* Ultra-Minimal Hero */}
        <div className="flex flex-col items-center text-center mb-16 mt-8">
          <h1
            className="font-extrabold leading-none tracking-tighter mb-6"
            style={{ fontSize: "clamp(48px, 7.5vw, 96px)", color: "rgba(26,28,29,1)" }}
          >
            INITIATE OPENCLAW
          </h1>
          <p
            className="font-medium"
            style={{ fontSize: "16px", color: "rgba(113,113,122,1)" }}
          >
            Automate. Synchronize. Control.
          </p>
        </div>

        {/* Simplified Grid - 3 horizontal cards */}
        <div className="flex gap-4 mb-20">
          {GRID_CARDS.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-4 rounded-2xl px-8 py-6"
              style={{ background: "rgba(255,255,255,0.40)" }}
            >
              <div className="text-zinc-400">
                <Icon className="w-5 h-5" />
              </div>
              <span
                className="font-bold text-xs"
                style={{ color: "rgba(161,161,170,1)" }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Hero Call to Action */}
        <div className="flex flex-col items-center gap-8">
          <Button
            onClick={onNext}
            className="relative rounded-full px-16 py-5 h-auto bg-white hover:bg-white/90 shadow-md overflow-hidden"
          >
            <span
              className="absolute inset-0 rounded-full"
              style={{ background: "rgba(186,0,52,1)" }}
            />
            <span className="relative flex items-center gap-3 text-white font-black text-sm">
              Start Setup
              <ArrowRight className="w-4 h-4" />
            </span>
          </Button>

          <button
            onClick={onNext}
            className="text-[10px] font-normal transition-colors hover:text-zinc-900"
            style={{ color: "rgba(82,82,91,1)" }}
          >
            Access Command Center
          </button>
        </div>
      </main>
    </div>
  );
}
