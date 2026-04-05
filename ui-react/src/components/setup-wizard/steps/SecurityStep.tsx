import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Shield, Eye, Users } from "lucide-react";
import { useEffect, useState } from "react";

interface SecurityStepProps {
  onCanProceedChange: (canProceed: boolean) => void;
}

const SECURITY_ITEMS = [
  {
    icon: Shield,
    title: "Zero-Harm Protocol",
    description: "Ensure all equipment is checked and secured before initiating any claw maneuvers.",
  },
  {
    icon: Eye,
    title: "Constant Supervision",
    description: "Never leave an active session unattended. Real-time monitoring is mandatory for all users.",
  },
  {
    icon: Users,
    title: "Community Awareness",
    description: "Respect boundaries of public spaces and bystanders during high-altitude operations.",
  },
];

export function SecurityStep({ onCanProceedChange }: SecurityStepProps) {
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  useEffect(() => {
    onCanProceedChange(agreedToTerms);
  }, [agreedToTerms, onCanProceedChange]);

  // Gate: start disabled
  useEffect(() => {
    onCanProceedChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-[#eeeef0]"
    >
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: [
            "radial-gradient(ellipse 70% 50% at 50% 40%, rgba(186,0,52,0.10) 0%, transparent 70%)",
          ].join(", "),
        }}
      />

      <div className="w-full max-w-xl flex flex-col items-center text-center gap-6">
        {/* Step label */}
        <p className="text-xs font-bold tracking-[0.18em] uppercase text-[rgba(186,0,52,1)]">
          STEP 2 OF 4
        </p>

        {/* Header */}
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900">
            Safety First
          </h1>
          <p className="text-slate-500 text-base leading-relaxed px-4">
            Our community thrives on mutual respect and physical safety. Please
            confirm your commitment to these principles.
          </p>
        </div>

        {/* Checklist Card */}
        <div
          className="w-full rounded-3xl p-6 flex flex-col gap-6 bg-[rgba(255,255,255,0.85)] shadow-[0px_2px_24px_rgba(0,0,0,0.06)]"
        >
          {SECURITY_ITEMS.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex items-start gap-4 text-left">
              {/* Icon circle */}
              <div
                className="shrink-0 size-11 rounded-full flex items-center justify-center"
                style={{ background: "rgba(186,0,52,0.10)" }}
              >
                <Icon
                  className="w-5 h-5"
                  style={{ color: "rgba(186,0,52,1)" }}
                />
              </div>
              <div className="flex flex-col gap-1 pt-0.5">
                <span className="text-base font-bold text-slate-900">
                  {title}
                </span>
                <span className="text-sm text-slate-500 leading-relaxed">
                  {description}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Agree Checkbox */}
        <label className="flex items-center gap-3 cursor-pointer">
          <Checkbox 
            id="terms-checkbox" 
            name="terms-checkbox" 
            checked={agreedToTerms}
            onCheckedChange={() => setAgreedToTerms(!agreedToTerms)}
            className="h-6 w-6 rounded-sm border-2 border-slate-300 bg-white text-[#8e0025] focus:ring-0 focus:ring-offset-0 transition-all cursor-pointer accent-[#8e0025]"
          />
          <span className="text-sm text-slate-600 leading-snug">
            I have read and agree to the terms above
          </span>
        </label>
      </div>
    </div>
  );
}
