import { ArrowRight, Zap, Cpu, Database } from "lucide-react";
import { useState } from "react";
import { useWizardStore } from "@/store/setup-wizard.store";

interface ModelSelectionStepProps {
  onNext: () => void;
  onBack: () => void;
}

const MODELS = [
  {
    id: "claude",
    name: "Claude (Recommended)",
    provider: "Anthropic",
    description: "Smartest and most reliable",
    badge: "bolt",
    badgeLabel: "Advanced",
    recommended: true,
    gradient: "bg-gradient-to-br from-orange-400 via-primary to-purple-600",
    icon: Cpu,
  },
  {
    id: "gpt4",
    name: "GPT-4o (OpenAI)",
    provider: "OpenAI",
    description: "Fast and powerful",
    badge: "zap",
    badgeLabel: "Fastest",
    recommended: false,
    gradient: "bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600",
    icon: Zap,
  },
  {
    id: "gemini",
    name: "Gemini 1.5 Pro (Google)",
    provider: "Google",
    description: "Massive context window",
    badge: "database",
    badgeLabel: "2M Context",
    recommended: false,
    gradient: "bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700",
    icon: Database,
  },
];

export function ModelSelectionStep({ onNext: _onNext }: ModelSelectionStepProps) {
  const { wizardState, updateWizardState } = useWizardStore();
  const [selectedModel, setSelectedModel] = useState(wizardState.selectedModel || "claude");

  const handleSelect = (modelId: string) => {
    setSelectedModel(modelId);
    updateWizardState({ selectedModel: modelId });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tighter text-slate-900 dark:text-slate-50">
          Choose your AI model
        </h1>
        <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed mx-auto">
          Select an AI model to power your assistant. Not sure? We recommend Claude.
        </p>
      </div>

      {/* Model Cards Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {MODELS.map((model) => (
          <button
            key={model.id}
            onClick={() => handleSelect(model.id)}
            className={`group relative flex flex-col overflow-hidden rounded-xl bg-white dark:bg-slate-900 shadow-sm transition-all hover:shadow-xl hover:-translate-y-1 ${
              selectedModel === model.id ? "ring-2 ring-primary" : ""
            }`}
          >
            {/* Gradient Background */}
            <div className="relative aspect-[16/10] w-full overflow-hidden">
              <div
                className={`absolute inset-0 ${model.gradient} opacity-90 group-hover:scale-110 transition-transform duration-500`}
              />
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <div className="h-16 w-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
                  <model.icon className="w-8 h-8 text-white" />
                </div>
              </div>
              {model.recommended && (
                <div className="absolute left-4 top-4 rounded-full bg-white/90 dark:bg-slate-900/90 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary backdrop-blur-md">
                  Recommended
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex flex-1 flex-col p-6">
              <div className="mb-4">
                <span className="text-xs font-semibold uppercase tracking-widest text-primary/70">
                  Powered by {model.provider}
                </span>
                <h3 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                  {model.name}
                </h3>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
                  {model.description}
                </p>
              </div>
              <div className="mt-auto flex items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1 text-slate-400">
                  {model.badge === "bolt" && <Zap className="w-4 h-4" />}
                  {model.badge === "zap" && <Zap className="w-4 h-4" />}
                  {model.badge === "database" && <Database className="w-4 h-4" />}
                  <span className="text-xs">{model.badgeLabel}</span>
                </div>
                <button className="flex h-9 items-center justify-center rounded-full bg-primary px-6 text-sm font-bold text-white shadow-md shadow-primary/30 transition-transform active:scale-95 hover:bg-primary/90">
                  Select
                </button>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* View More Models */}
      <div className="mt-12 flex flex-col items-center">
        <button className="group flex items-center gap-2 rounded-xl bg-slate-200/50 dark:bg-slate-800/50 px-6 py-3 transition-all hover:bg-slate-200 dark:hover:bg-slate-800">
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            View more models
          </span>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-y-0.5 transition-transform" />
        </button>
        <p className="mt-4 text-xs text-slate-400 text-center uppercase tracking-widest">
          Explore over 50+ models from Llama, Mistral, and more
        </p>
      </div>
    </div>
  );
}
