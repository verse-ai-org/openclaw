import { ArrowRight, Zap, Cpu, Database } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
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

const MORE_MODELS = [
  {
    id: "gpt4o",
    name: "GPT-4o",
    description: "Latest AI model to complete tasks",
    badge: "FASTEST",
    icon: Zap,
    provider: "OpenAI",
  },
  {
    id: "gpt4-turbo",
    name: "GPT-4 Turbo",
    description: "Advanced reasoning and intelligence",
    badge: "FAST CONTEXT",
    icon: Cpu,
    provider: "OpenAI",
  },
  {
    id: "claude-sonnet",
    name: "Claude 3.5 Sonnet",
    description: "Best for coding and analysis",
    badge: "BALANCED",
    icon: Database,
    provider: "Anthropic",
  },
  {
    id: "claude-opus",
    name: "Claude 3 Opus",
    description: "Best for deep, creative and analytical tasks",
    badge: "LARGE CONTEXT",
    icon: Cpu,
    provider: "Anthropic",
  },
  {
    id: "llama-70b",
    name: "Llama 3 70B",
    description: "Open source model for broad utility",
    badge: "OPEN SOURCE",
    icon: Zap,
    provider: "Meta",
  },
  {
    id: "gemini-pro",
    name: "Gemini 1.5 Pro",
    description: "Multimodal model for diverse tasks",
    badge: "MULTIMODAL",
    icon: Database,
    provider: "Google",
  },
  {
    id: "minimax-m2.5",
    name: "Minimax M2.5",
    description: "Multimodal model for diverse tasks",
    badge: "MULTIMODAL",
    icon: Database,
    provider: "Minimax",
  },
  {
    id: "Minimax-M2.5-highspeed",
    name: "Minimax M2.5",
    description: "Multimodal model for diverse tasks",
    badge: "MULTIMODAL",
    icon: Database,
    provider: "Minimax",
  },
];

export function ModelSelectionStep({ onNext: _onNext }: ModelSelectionStepProps) {
  const { wizardState, updateWizardState } = useWizardStore();
  const [selectedModel, setSelectedModel] = useState(wizardState.selectedModel || "claude");
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("All");

  const handleSelect = (modelId: string) => {
    setSelectedModel(modelId);
    updateWizardState({ selectedModel: modelId });
  };

  const providers = ["All", "OpenAI", "Anthropic", "Google", "Minimax"];

  const filteredModels =
    selectedProvider === "All"
      ? MORE_MODELS
      : MORE_MODELS.filter((m) => m.provider === selectedProvider);

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
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogTrigger asChild>
            <button className="group flex items-center gap-2 rounded-xl bg-slate-200/50 dark:bg-slate-800/50 px-6 py-3 transition-all hover:bg-slate-200 dark:hover:bg-slate-800">
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                View more models
              </span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0">
            <div className="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <DialogTitle className="text-2xl font-bold">Select Model</DialogTitle>
              </div>

              {/* Search Bar */}
              <div className="mb-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search models, providers, or capabilities"
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Provider Tabs */}
              <div className="flex gap-2 flex-wrap">
                {providers.map((provider) => (
                  <button
                    key={provider}
                    onClick={() => setSelectedProvider(provider)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                      selectedProvider === provider
                        ? "bg-primary text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    {provider}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Models List */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-3">
                {filteredModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      handleSelect(model.id);
                    }}
                    className={`w-full flex items-center gap-4 p-4 rounded-lg border transition-all ${
                      selectedModel === model.id
                        ? "border-primary bg-primary/5 dark:bg-primary/10"
                        : "border-slate-200 dark:border-slate-700 hover:border-primary hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <model.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 text-left">
                      <h4 className="font-semibold text-slate-900 dark:text-white">{model.name}</h4>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {model.description}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary">
                        {model.badge}
                      </span>
                    </div>
                    {selectedModel === model.id && (
                      <div className="flex-shrink-0 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Footer Buttons */}
            <DialogFooter className="px-6 py-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setOpenDialog(false)}
                className="flex-1 px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setOpenDialog(false)}
                className="flex-1 px-4 py-3 rounded-lg bg-primary text-white font-semibold hover:bg-primary/90 transition-colors"
              >
                Select Model
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <p className="mt-4 text-xs text-slate-400 text-center uppercase tracking-widest">
          Explore over 50+ models from Llama, Mistral, and more
        </p>
      </div>
    </div>
  );
}
