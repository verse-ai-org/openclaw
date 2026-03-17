import { ArrowRight, ChevronLeft, Check } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AUTH_PROVIDER_GROUPS,
  getFeaturedProviders,
  findProviderGroup,
  type AuthProviderGroupDef,
  type AuthMethodDef,
} from "@/data/auth-choice-groups";
import { useWizardStore } from "@/store/setup-wizard.store";

interface ModelSelectionStepProps {
  onNext: () => void;
  onBack: () => void;
}

// Provider icon emoji map — purely cosmetic
const PROVIDER_EMOJI: Record<string, string> = {
  anthropic: "🟠",
  openai: "🟢",
  google: "🔵",
  moonshot: "🌙",
  xai: "✖️",
  mistral: "🌊",
  minimax: "⚡",
  volcengine: "🌋",
  byteplus: "🔶",
  openrouter: "🔀",
  kilocode: "⚙️",
  qwen: "☁️",
  zai: "🤖",
  qianfan: "🦅",
  modelstudio: "☁️",
  copilot: "🐙",
  chutes: "🧵",
  vllm: "🏠",
  "ai-gateway": "△",
  "cloudflare-ai-gateway": "🟠",
  opencode: "</>",
  xiaomi: "📱",
  synthetic: "🧪",
  together: "🤝",
  huggingface: "🤗",
  venice: "🏛️",
  litellm: "🔗",
  custom: "🔧",
};

// Gradient backgrounds for featured provider cards
const FEATURED_GRADIENT: Record<string, string> = {
  anthropic: "bg-gradient-to-br from-orange-400 via-primary to-purple-600",
  openai: "bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600",
  google: "bg-gradient-to-br from-blue-500 via-indigo-600 to-violet-700",
};

/** Single featured provider card shown on the first screen */
function FeaturedProviderCard({
  group,
  selected,
  onSelect,
}: {
  group: AuthProviderGroupDef;
  selected: boolean;
  onSelect: (g: AuthProviderGroupDef) => void;
}) {
  const gradient = FEATURED_GRADIENT[group.id] ?? "bg-gradient-to-br from-slate-400 to-slate-600";
  const emoji = PROVIDER_EMOJI[group.id] ?? "🤖";

  return (
    <button
      onClick={() => onSelect(group)}
      className={`group relative flex flex-col overflow-hidden rounded-xl bg-white dark:bg-slate-900 shadow-sm transition-all hover:shadow-xl hover:-translate-y-1 ${
        selected ? "ring-2 ring-primary" : ""
      }`}
    >
      {/* Gradient header */}
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        <div
          className={`absolute inset-0 ${gradient} opacity-90 group-hover:scale-110 transition-transform duration-500`}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-16 w-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 text-3xl">
            {emoji}
          </div>
        </div>
        {group.id === "anthropic" && (
          <div className="absolute left-4 top-4 rounded-full bg-white/90 dark:bg-slate-900/90 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary backdrop-blur-md">
            Recommended
          </div>
        )}
        {selected && (
          <div className="absolute right-4 top-4 rounded-full bg-primary p-1">
            <Check className="w-3.5 h-3.5 text-white" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-6">
        <span className="text-xs font-semibold uppercase tracking-widest text-primary/70">
          {group.label}
        </span>
        <h3 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
          {group.methods.length === 1 ? group.methods[0].label : group.label}
        </h3>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
          {group.hint}
        </p>
        <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <span className="flex h-9 items-center justify-center rounded-full bg-primary px-6 text-sm font-bold text-white shadow-md shadow-primary/30">
            Select
          </span>
        </div>
      </div>
    </button>
  );
}

/** Auth method selector shown when a provider has multiple options */
function AuthMethodSelector({
  group,
  selectedMethodId,
  onSelect,
  onBack,
}: {
  group: AuthProviderGroupDef;
  selectedMethodId: string;
  onSelect: (m: AuthMethodDef) => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-primary transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          {group.label} — choose auth method
        </h2>
      </div>

      <div className="space-y-3">
        {group.methods.map((method) => (
          <button
            key={method.id}
            onClick={() => onSelect(method)}
            className={`w-full flex items-center gap-4 p-5 rounded-xl border-2 transition-all text-left ${
              selectedMethodId === method.id
                ? "border-primary bg-primary/5 dark:bg-primary/10"
                : "border-slate-200 dark:border-slate-700 hover:border-primary/50 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl">
              {method.type === "oauth" ? "🔐" : method.type === "proxy" ? "🔌" : method.type === "custom" ? "🔧" : "🔑"}
            </div>
            <div className="flex-1">
              <div className="font-semibold text-slate-900 dark:text-white">{method.label}</div>
              {method.hint && (
                <div className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{method.hint}</div>
              )}
              {method.defaultModelId && (
                <div className="text-xs text-primary/70 mt-1 font-mono">{method.defaultModelId}</div>
              )}
            </div>
            <div
              className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                selectedMethodId === method.id
                  ? "border-primary bg-primary"
                  : "border-slate-300 dark:border-slate-600"
              }`}
            >
              {selectedMethodId === method.id && <Check className="w-3 h-3 text-white" />}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/** All-providers dialog content */
function AllProvidersDialog({
  selectedGroupId,
  onSelect,
  onClose,
}: {
  selectedGroupId: string;
  onSelect: (g: AuthProviderGroupDef) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = AUTH_PROVIDER_GROUPS.filter(
    (g) =>
      g.label.toLowerCase().includes(search.toLowerCase()) ||
      g.hint?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <div className="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-700">
        <DialogTitle className="text-2xl font-bold mb-4">All Providers</DialogTitle>
        <input
          type="text"
          placeholder="Search providers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-2">
          {filtered.map((group) => (
            <button
              key={group.id}
              onClick={() => {
                onSelect(group);
                onClose();
              }}
              className={`w-full flex items-center gap-4 p-4 rounded-lg border transition-all text-left ${
                selectedGroupId === group.id
                  ? "border-primary bg-primary/5 dark:bg-primary/10"
                  : "border-slate-200 dark:border-slate-700 hover:border-primary/50 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-lg">
                {PROVIDER_EMOJI[group.id] ?? "🤖"}
              </div>
              <div className="flex-1">
                <div className="font-semibold text-slate-900 dark:text-white">{group.label}</div>
                {group.hint && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">{group.hint}</div>
                )}
              </div>
              {selectedGroupId === group.id && (
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      <DialogFooter className="px-6 py-4 border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-3 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Cancel
        </button>
      </DialogFooter>
    </>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ModelSelectionStep({ onNext }: ModelSelectionStepProps) {
  const { wizardState, updateWizardState } = useWizardStore();

  // Which provider group is highlighted (not yet confirmed)
  const [pendingGroupId, setPendingGroupId] = useState(
    wizardState.authProviderGroup || "anthropic",
  );
  // Phase: "provider" = first screen, "method" = second screen (auth method picker)
  const [phase, setPhase] = useState<"provider" | "method">("provider");
  const [dialogOpen, setDialogOpen] = useState(false);

  const featuredGroups = getFeaturedProviders();
  const pendingGroup = findProviderGroup(pendingGroupId) ?? featuredGroups[0];

  /** Called when user selects/clicks a provider group */
  const handleSelectGroup = (group: AuthProviderGroupDef) => {
    setPendingGroupId(group.id);
    if (group.methods.length === 1) {
      // Only one auth method — confirm immediately and proceed
      const method = group.methods[0];
      commitSelection(group, method);
    } else {
      // Multiple methods — show second screen
      setPhase("method");
    }
  };

  /** Called when user picks an auth method from the second screen */
  const handleSelectMethod = (method: AuthMethodDef) => {
    if (!pendingGroup) return;
    commitSelection(pendingGroup, method);
  };

  /** Persist selection to store and advance the wizard */
  const commitSelection = (group: AuthProviderGroupDef, method: AuthMethodDef) => {
    updateWizardState({
      authProviderGroup: group.id,
      authMethod: method.id,
      resolvedModelId: method.defaultModelId ?? "",
      // Keep legacy field in sync for backwards compat with saveOnboardingConfig
      selectedModel:
        group.id === "openai"
          ? "gpt4"
          : group.id === "google"
            ? "gemini"
            : "claude",
    });
    onNext();
  };

  // ── Method picker screen ───────────────────────────────────────────────
  if (phase === "method" && pendingGroup) {
    const currentMethodId =
      wizardState.authProviderGroup === pendingGroup.id
        ? wizardState.authMethod
        : pendingGroup.methods[0].id;

    return (
      <div className="space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tighter text-slate-900 dark:text-slate-50">
            Choose your AI model
          </h1>
          <p className="text-lg text-slate-500 dark:text-slate-400">
            Select how you want to authenticate with {pendingGroup.label}.
          </p>
        </div>
        <AuthMethodSelector
          group={pendingGroup}
          selectedMethodId={currentMethodId}
          onSelect={handleSelectMethod}
          onBack={() => setPhase("provider")}
        />
      </div>
    );
  }

  // ── Provider picker screen ─────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tighter text-slate-900 dark:text-slate-50">
          Choose your AI model
        </h1>
        <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed mx-auto">
          Select an AI provider to power your assistant. Not sure? We recommend Claude.
        </p>
      </div>

      {/* Featured provider cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {featuredGroups.map((group) => (
          <FeaturedProviderCard
            key={group.id}
            group={group}
            selected={pendingGroupId === group.id}
            onSelect={handleSelectGroup}
          />
        ))}
      </div>

      {/* View more providers */}
      <div className="mt-12 flex flex-col items-center">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <button className="group flex items-center gap-2 rounded-xl bg-slate-200/50 dark:bg-slate-800/50 px-6 py-3 transition-all hover:bg-slate-200 dark:hover:bg-slate-800">
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                View more providers
              </span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0">
            <AllProvidersDialog
              selectedGroupId={pendingGroupId}
              onSelect={handleSelectGroup}
              onClose={() => setDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
        <p className="mt-4 text-xs text-slate-400 text-center uppercase tracking-widest">
          {AUTH_PROVIDER_GROUPS.length}+ providers including Mistral, Moonshot, xAI, and more
        </p>
      </div>
    </div>
  );
}
 