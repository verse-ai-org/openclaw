import { useEffect, useRef } from "react";
import { Target, RefreshCw, Rocket, ChevronRight } from "lucide-react";
import gsap from "gsap";
import Orb from "./orb";

interface WelcomeStepProps {
  onNext: () => void;
}

const GRID_CARDS = [
  { icon: Target, label: "TARGET" },
  { icon: RefreshCw, label: "SYNC" },
  { icon: Rocket, label: "LAUNCH" },
];

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  const iconRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Set initial hidden state directly so elements are invisible before animation
    gsap.set(iconRef.current, { opacity: 0, scale: 0.5 });
    gsap.set(titleRef.current, { opacity: 0, y: 36 });
    if (cardsRef.current) {
      gsap.set(cardsRef.current.children, { opacity: 0, y: 20, scale: 0.92 });
    }
    if (ctaRef.current) {
      gsap.set(ctaRef.current.children, { opacity: 0, y: 16 });
    }

    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    tl.to(iconRef.current, { opacity: 1, scale: 1, duration: 0.7, delay: 0.2 })
      .to(titleRef.current, { opacity: 1, y: 0, duration: 0.75 }, "-=0.35")
      .to(
        cardsRef.current!.children,
        { opacity: 1, y: 0, scale: 1, duration: 0.55, stagger: 0.1 },
        "-=0.4",
      )
      .to(
        ctaRef.current!.children,
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.12 },
        "-=0.3",
      );

    return () => {
      tl.kill();
    };
  }, []);

  return (
    <div className="relative w-full min-h-screen flex flex-col overflow-hidden bg-[#eeeef0]">
      {/* OGL Orb — full-screen WebGL background, z-0 */}
      <div className="pointer-events-none absolute inset-0" style={{ zIndex: 0 }}>
        <Orb
          hoverIntensity={0.16}
          rotateOnHover
          hue={0}
          forceHoverState={false}
          backgroundColor="#eeeef0"
        />
      </div>

      {/* Vignette overlay to blend orb into page bg */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          zIndex: 1,
          background:
            "radial-gradient(ellipse 90% 70% at 50% 42%, transparent 25%, rgba(238,238,240,0.6) 100%)",
        }}
      />

      {/* Header */}
      <header
        className="relative flex items-center justify-end px-8 py-5"
        style={{ zIndex: 10 }}
      >
        <div className="flex items-center gap-4">
          <button className="text-zinc-400 hover:text-zinc-600 transition-colors p-1">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
            </svg>
          </button>
          <button className="text-zinc-400 hover:text-zinc-600 transition-colors p-1">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main
        className="relative flex flex-col items-center justify-center flex-1 px-6 gap-12"
        style={{ zIndex: 10 }}
      >
        {/* Logo icon */}
        {/* <div ref={iconRef} style={{ color: "rgba(186,0,52,1)" }}>
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        </div> */}

        {/* Hero Title */}
        <div ref={titleRef} className="text-center">
          <h1
            className="font-black leading-none tracking-tight uppercase"
            style={{ fontSize: "clamp(56px, 8vw, 100px)" }}
          >
            <span style={{ color: "rgba(26,28,29,1)" }}>INITIATE </span>
            <span style={{ color: "rgba(186,0,52,1)" }}>BOSSIM</span>
          </h1>
          <p
            className="mt-4 tracking-[0.25em] uppercase font-medium"
            style={{ fontSize: "13px", color: "rgba(150,150,158,1)" }}
          >
            AUTOMATE. SYNCHRONIZE. CONTROL.
          </p>
        </div>

        {/* Feature Cards */}
        <div ref={cardsRef} className="flex gap-3">
          {GRID_CARDS.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-full px-6 py-3 border border-white/40 backdrop-blur-md"
              style={{
                background: "rgba(255,255,255,0.28)",
                boxShadow: "0 2px 12px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
              }}
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
        <div ref={ctaRef} className="flex flex-col items-center gap-4">
          <button
            onClick={onNext}
            className="flex items-center gap-2 rounded-full px-12 py-4 font-black text-sm tracking-[0.12em] uppercase backdrop-blur-xl transition-all hover:scale-[1.03] active:scale-[0.98]"
            style={{
              background: "rgba(186,0,52,0.88)",
              color: "#ffffff",
              border: "1px solid rgba(255,255,255,0.25)",
              boxShadow: "0 8px 32px rgba(186,0,52,0.30), inset 0 1px 0 rgba(255,255,255,0.2)",
            }}
          >
            START SETUP
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            onClick={onNext}
            className="tracking-[0.18em] uppercase transition-colors hover:text-zinc-700 backdrop-blur-sm rounded-full px-4 py-1"
            style={{
              fontSize: "10px",
              color: "rgba(150,150,158,1)",
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.2)",
            }}
          >
            ACCESS COMMAND CENTER
          </button>
        </div>
      </main>
    </div>
  );
}
