import { Shield, Info } from "lucide-react";
import { useState } from "react";
import { GlassCard } from "../GlassCard";

interface SecurityStepProps {
  onNext: () => void;
  onBack: () => void;
}

const SECURITY_ITEMS = [
  {
    title: "Only run on devices you trust",
    description: "Ensure your environment is secure before execution.",
  },
  {
    title: "Never share your API keys",
    description: "Keep your credentials private and rotate them if compromised.",
  },
  {
    title: "Check logs regularly",
    description: "Monitor activity to ensure tasks are performing as expected.",
  },
];

export function SecurityStep({ onNext: _onNext }: SecurityStepProps) {
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  return (
    <div className="max-w-xl mx-auto flex flex-col items-center text-center gap-6 mb-12">
      {/* Icon */}
      <div className="size-20 bg-primary/10 dark:bg-primary/20 rounded-3xl flex items-center justify-center text-primary">
        <Shield className="w-10 h-10" />
      </div>

      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Safety Confirmation
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-lg leading-relaxed px-4">
          OpenClaw is a powerful AI assistant that helps you process files and execute tasks. For
          your safety, please ensure:
        </p>
      </div>

      {/* Checklist Section */}
      <GlassCard className="w-full">
        <div className="flex flex-col divide-y divide-primary/10">
          {SECURITY_ITEMS.map((item, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-4 p-5 hover:bg-primary/5 transition-colors ${
                idx === 0 ? "rounded-t-2xl" : ""
              } ${idx === SECURITY_ITEMS.length - 1 ? "rounded-b-2xl" : ""}`}
            >
              <div className="flex flex-col gap-1 text-left flex-1">
                <span className="text-base font-semibold text-slate-900 dark:text-white">
                  {item.title}
                </span>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {item.description}
                </span>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Agree Section */}
      <div className="px-2">
        <label className="flex items-center gap-4 cursor-pointer group">
          <div className="relative flex items-center">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="peer h-5 w-5 rounded-full border-primary/30 border-2 bg-transparent text-primary checked:bg-primary checked:border-primary focus:ring-0 focus:ring-offset-0 transition-all cursor-pointer"
            />
          </div>
          <span className="text-sm text-slate-600 dark:text-slate-400 leading-snug">
            I have read and agree to the terms above
          </span>
        </label>
      </div>

      {/* Footer Link */}
      <div className="text-center">
        <button className="text-primary/70 dark:text-primary/80 text-sm font-semibold hover:text-primary transition-colors flex items-center justify-center gap-1 mx-auto">
          <Info className="w-4 h-4" />
          Learn more about safety protocols
        </button>
      </div>
    </div>
  );
}
