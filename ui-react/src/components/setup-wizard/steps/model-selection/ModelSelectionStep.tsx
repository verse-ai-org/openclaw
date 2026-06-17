import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { AuthProviderGroupDef } from "@/data/auth-choice-groups";
import { useFeaturedProviders } from "@/store/provider-catalog.store";
import { useWizardStore } from "@/store/setup-wizard.store";
import { FeaturedProviderCard } from "./FeaturedProviderCard";
import { AllProvidersDialog } from "./AllProvidersDialog";

interface ModelSelectionStepProps {
  onNext: () => void;
  onBack: () => void;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ModelSelectionStep({ onNext }: ModelSelectionStepProps) {
  const { updateWizardState } = useWizardStore();

  const [pendingGroupId, setPendingGroupId] = useState("anthropic");
  const [dialogOpen, setDialogOpen] = useState(false);

  const featuredGroups = useFeaturedProviders();

  /**
   * Called when user selects a provider — from featured cards or the Dialog.
   * Skips the method picker screen: picks the first oauth method if available,
   * otherwise the first method. The Auth Modal (ApiKeyStep) lets the user
   * switch between OAuth / API Key via its Segmented Control.
   */
  const handleSelectGroup = (group: AuthProviderGroupDef) => {
    setPendingGroupId(group.id);
    // Close the dialog if open
    setDialogOpen(false);
    // Prefer oauth method; fall back to first method
    const method =
      group.methods.find((m) => m.type === "oauth") ?? group.methods[0];
    updateWizardState({
      authProviderGroup: group.id,
      authMethod: method.id,
      resolvedModelId: method.defaultModelId ?? "",
    });
    onNext();
  };

  // ── Provider picker screen ─────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center  bg-[#eeeef0]"
    >
      {/* Header */}
      <div className="flex flex-col items-center px-6 text-center gap-6">
        {/* Step label */}
        <p className="text-xs font-bold tracking-[0.18em] uppercase text-[rgba(186,0,52,1)]">
          Step 03 — Configuration
        </p>
        {/* Header */}
        <div className="flex flex-col gap-3">
          {/* Title */}
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900">
            Choose your AI model
          </h1>
          {/* Subtitle */}
          <p className="text-slate-500 text-base leading-relaxed px-4">
            Select the intelligence that will power your workflow. Each provider offers unique specialized capabilities.
          </p>
        </div>
      </div>

      {/* Featured provider cards — 3-column bento grid */}
      <div
        className="grid w-full gap-8 mt-6 grid-cols-3 max-w-6xl mx-8"
      >
        {featuredGroups.map((group) => (
          <FeaturedProviderCard
            key={group.id}
            group={group}
            selected={pendingGroupId === group.id}
            onSelect={handleSelectGroup}
          />
        ))}
      </div>

      {/* View more providers — plain text link per design */}
      <div className="flex items-center justify-center">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <button
              className="flex items-center mt-6 gap-1.5 transition-opacity hover:opacity-70"
            >
              <span
                className="font-semibold text-[rgba(160,161,168,1)]"
              >
                View more providers
              </span>
              {/* Chevron arrow icon */}
              <svg width="6" height="9" viewBox="0 0 6 9" fill="none" aria-hidden="true">
                <path
                  d="M1 1l4 3.5L1 8"
                  stroke="rgba(160,161,168,1)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </DialogTrigger>
          <DialogContent
            showCloseButton={false}
            className="flex flex-col p-0 overflow-hidden bg-white max-h-[85vh] rounded-3xl"
            style={{ maxWidth: 900, width: "90vw" }}
          >
            <AllProvidersDialog
              selectedGroupId={pendingGroupId}
              onSelect={handleSelectGroup}
              onClose={() => setDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
