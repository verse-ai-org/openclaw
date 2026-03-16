import { Database, WandSparkles, UserPlus, ArrowRight, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "../GlassCard";

interface WelcomeStepProps {
  onNext: () => void;
}

const SETUP_STEPS = [
  {
    icon: Database,
    title: "Choose your AI model",
    description: "Select the brain that powers your assistant.",
  },
  {
    icon: WandSparkles,
    title: "Connect messaging apps (optional)",
    description: "Talk to OpenClaw on WhatsApp, Telegram, or Slack.",
  },
  {
    icon: UserPlus,
    title: "Start using",
    description: "Jump right in and start being more productive.",
  },
];

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="max-w-xl mx-auto flex flex-col items-center text-center gap-6 mb-12">
      {/* 大图标 */}
      <div className="size-20 bg-primary/10 dark:bg-primary/20 rounded-3xl flex items-center justify-center text-primary">
        <Utensils className="w-10 h-10" />
      </div>

      {/* 进度标记 */}
      <div className="mb-2 px-4 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full">
        0/5
      </div>

      {/* 标题 */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Welcome to <span className="text-primary">OpenClaw</span>
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-lg leading-relaxed px-4">
          Your personal AI assistant, helping you anytime, anywhere.
        </p>
      </div>

      {/* 设置步骤卡片 */}
      <div className="w-full space-y-4 mt-8">
        {SETUP_STEPS.map((step, idx) => {
          const IconComponent = step.icon;
          return (
            <GlassCard key={idx}>
              <div className="flex items-center gap-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <IconComponent className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-slate-900 dark:text-white">{step.title}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{step.description}</p>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* CTA 按钮 */}
      <div className="w-full max-w-sm mt-8">
        <Button
          onClick={onNext}
          size="lg"
          className="w-full rounded-full h-12 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/30"
        >
          Start Setup
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <button className="mt-6 w-full text-sm font-semibold text-slate-400 hover:text-primary transition-colors">
          Already have an account? Log in
        </button>
      </div>
    </div>
  );
}
