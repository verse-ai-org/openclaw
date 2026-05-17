import { useEffect, useRef } from "react";
import gsap from "gsap";
import { RefreshCw } from "lucide-react";
import Orb from "@/components/setup-wizard/steps/welcome/orb";
import { useBootProgress } from "./use-boot-progress";
import { defaultMessageForPhase } from "./boot-phases";

export function BootSplash() {
  const { payload, retry, retrying } = useBootProgress();
  const contentRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!contentRef.current) return;
    gsap.fromTo(
      contentRef.current,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.65, ease: "power3.out", delay: 0.15 },
    );
  }, []);

  useEffect(() => {
    if (!statusRef.current) return;
    gsap.fromTo(
      statusRef.current,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" },
    );
  }, [payload.phase, payload.message]);

  const failed = payload.phase === "failed";
  const statusLine = payload.message ?? defaultMessageForPhase(payload.phase);

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden bg-[#eeeef0]">
      <div className="pointer-events-none absolute inset-0" style={{ zIndex: 0 }}>
        <Orb
          hoverIntensity={0.16}
          rotateOnHover
          hue={0}
          forceHoverState={false}
          backgroundColor="#eeeef0"
        />
      </div>

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          zIndex: 1,
          background:
            "radial-gradient(ellipse 90% 70% at 50% 42%, transparent 25%, rgba(238,238,240,0.6) 100%)",
        }}
        aria-hidden
      />

      <main
        className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center"
        role="status"
        aria-live="polite"
      >
        <div ref={contentRef} className="flex max-w-lg flex-col items-center gap-5">
          <h1
            className="font-black uppercase leading-none tracking-tight"
            style={{ fontSize: "clamp(40px, 6vw, 56px)" }}
          >
            <span style={{ color: "rgba(26,28,29,1)" }}>BOSS</span>
            <span style={{ color: "rgba(186,0,52,1)" }}>IM</span>
          </h1>

          <p
            ref={statusRef}
            className="font-medium leading-relaxed"
            style={{
              fontSize: "clamp(16px, 2.5vw, 20px)",
              color: failed ? "rgba(186,0,52,1)" : "rgba(90,90,98,1)",
            }}
          >
            {statusLine}
          </p>

          {failed && (
            <div className="mt-2 flex flex-col items-center gap-4">
              {payload.error && (
                <p className="max-w-md text-sm leading-relaxed text-zinc-500">
                  {payload.error}
                </p>
              )}
              <button
                type="button"
                disabled={retrying}
                onClick={() => void retry()}
                className="flex items-center gap-2 rounded-full px-8 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "rgba(186,0,52,0.88)" }}
              >
                <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
                {retrying ? "Retrying…" : "Retry"}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
