import { useEffect, useRef } from "react";
import { Target, RefreshCw, Rocket, ChevronRight } from "lucide-react";
import gsap from "gsap";

interface WelcomeStepProps {
  onNext: () => void;
}

const GRID_CARDS = [
  { icon: Target, label: "TARGET" },
  { icon: RefreshCw, label: "SYNC" },
  { icon: Rocket, label: "LAUNCH" },
];

// ─── Orb Config ───────────────────────────────────────────────────────────────
const ORB_COLOR_HEX = "#8c0028"; // backgroundColor param from reactbits URL
const HOVER_INTENSITY = 0.16;     // hoverIntensity param from reactbits URL

// Parse hex → {r, g, b} in 0-255 range
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

// ─── Simplex-like noise for organic edge distortion ───────────────────────────
function smoothNoise(x: number, y: number, t: number): number {
  return (
    Math.sin(x * 2.1 + t * 0.7) * 0.25 +
    Math.sin(y * 1.7 + t * 0.5) * 0.2 +
    Math.sin((x + y) * 1.3 + t * 0.9) * 0.15 +
    Math.sin(x * 3.5 - t * 0.4) * 0.1 +
    Math.sin(y * 2.8 + t * 1.1) * 0.1
  );
}

// ─── OrbCanvas Component ──────────────────────────────────────────────────────
function OrbCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const targetMouseRef = useRef({ x: 0.5, y: 0.5 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rgb = hexToRgb(ORB_COLOR_HEX);
    let w = 0;
    let h = 0;
    let t = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      targetMouseRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    };

    const draw = () => {
      t += 0.008;

      // Smooth mouse lerp
      mouseRef.current.x += (targetMouseRef.current.x - mouseRef.current.x) * 0.06;
      mouseRef.current.y += (targetMouseRef.current.y - mouseRef.current.y) * 0.06;

      ctx.clearRect(0, 0, w, h);

      // Orb center — offset by mouse with hover intensity
      const cx = w * 0.5 + (mouseRef.current.x - 0.5) * w * HOVER_INTENSITY;
      const cy = h * 0.45 + (mouseRef.current.y - 0.5) * h * HOVER_INTENSITY;
      const baseRadius = Math.min(w, h) * 0.28;

      // ── Outer ambient glow ──────────────────────────────────────────────────
      const ambientR = baseRadius * 2.6;
      const ambient = ctx.createRadialGradient(cx, cy, 0, cx, cy, ambientR);
      ambient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.07)`);
      ambient.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.03)`);
      ambient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
      ctx.fillStyle = ambient;
      ctx.fillRect(0, 0, w, h);

      // ── Distorted orb shape via many small arc segments ─────────────────────
      const SEGMENTS = 120;
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i <= SEGMENTS; i++) {
        const angle = (i / SEGMENTS) * Math.PI * 2;
        const nx = Math.cos(angle);
        const ny = Math.sin(angle);
        const noise = smoothNoise(nx, ny, t);
        const r = baseRadius * (1 + noise * 0.12);
        const px = cx + nx * r;
        const py = cy + ny * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      // Main orb gradient
      const hlX = cx - baseRadius * 0.32;
      const hlY = cy - baseRadius * 0.32;
      const orbGrad = ctx.createRadialGradient(hlX, hlY, 0, cx, cy, baseRadius * 1.05);
      orbGrad.addColorStop(0,   `rgba(${Math.min(rgb.r + 80, 255)}, ${Math.min(rgb.g + 40, 255)}, ${Math.min(rgb.b + 50, 255)}, 0.95)`);
      orbGrad.addColorStop(0.35, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.88)`);
      orbGrad.addColorStop(0.7,  `rgba(${Math.round(rgb.r * 0.6)}, ${Math.round(rgb.g * 0.5)}, ${Math.round(rgb.b * 0.5)}, 0.75)`);
      orbGrad.addColorStop(1,   `rgba(${Math.round(rgb.r * 0.3)}, 0, ${Math.round(rgb.b * 0.2)}, 0.55)`);

      ctx.fillStyle = orbGrad;
      ctx.fill();
      ctx.restore();

      // ── Specular highlight ──────────────────────────────────────────────────
      ctx.save();
      ctx.beginPath();
      ctx.arc(hlX, hlY, baseRadius * 0.28, 0, Math.PI * 2);
      const spec = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, baseRadius * 0.28);
      spec.addColorStop(0,   "rgba(255, 200, 210, 0.28)");
      spec.addColorStop(0.6, "rgba(255, 150, 170, 0.08)");
      spec.addColorStop(1,   "rgba(255, 120, 140, 0)");
      ctx.fillStyle = spec;
      ctx.fill();
      ctx.restore();

      // ── Inner depth shadow ───────────────────────────────────────────────────
      ctx.save();
      ctx.beginPath();
      const shX = cx + baseRadius * 0.2;
      const shY = cy + baseRadius * 0.2;
      const shadow = ctx.createRadialGradient(shX, shY, baseRadius * 0.2, shX, shY, baseRadius * 0.9);
      shadow.addColorStop(0,   "rgba(0, 0, 0, 0)");
      shadow.addColorStop(1,   "rgba(0, 0, 0, 0.22)");
      ctx.arc(cx, cy, baseRadius * 1.05, 0, Math.PI * 2);
      ctx.fillStyle = shadow;
      ctx.fill();
      ctx.restore();

      rafRef.current = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouseMove);
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 w-full h-full"
      style={{ zIndex: 1 }}
    />
  );
}

// ─── WelcomeStep ──────────────────────────────────────────────────────────────
export function WelcomeStep({ onNext }: WelcomeStepProps) {
  const iconRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.from(iconRef.current, {
        opacity: 0,
        scale: 0.5,
        duration: 0.7,
        delay: 0.2,
      })
        .from(
          titleRef.current,
          { opacity: 0, y: 36, duration: 0.75 },
          "-=0.35"
        )
        .from(
          cardsRef.current!.children,
          {
            opacity: 0,
            y: 20,
            scale: 0.92,
            duration: 0.55,
            stagger: 0.1,
          },
          "-=0.4"
        )
        .from(
          ctaRef.current!.children,
          {
            opacity: 0,
            y: 16,
            duration: 0.5,
            stagger: 0.12,
          },
          "-=0.3"
        );
    });

    return () => ctx.revert();
  }, []);

  return (
    <div className="relative w-full min-h-screen flex flex-col overflow-hidden bg-[#eeeef0]">
      {/* Orb Canvas — layer z-1 */}
      <OrbCanvas />

      {/* Subtle vignette on top of orb */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          zIndex: 2,
          background:
            "radial-gradient(ellipse 90% 70% at 50% 50%, transparent 30%, rgba(238,238,240,0.55) 100%)",
        }}
      />

      {/* Header */}
      <header className="relative flex items-center justify-end px-8 py-5" style={{ zIndex: 10 }}>
        <div className="flex items-center gap-4">
          <button className="text-zinc-400 hover:text-zinc-600 transition-colors p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
            </svg>
          </button>
          <button className="text-zinc-400 hover:text-zinc-600 transition-colors p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
        <div ref={iconRef} style={{ color: "rgba(186,0,52,1)" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        </div>

        {/* Hero Title */}
        <div ref={titleRef} className="text-center">
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
        <div ref={cardsRef} className="flex gap-3">
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
        <div ref={ctaRef} className="flex flex-col items-center gap-4">
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