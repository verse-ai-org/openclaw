import { useEffect, useMemo, useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { findAuthMethod, findProviderGroup } from "@/data/auth-choice-groups";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ProviderModelSection } from "./ProviderModelSection";
import type { ProviderModelDraft } from "./types";

interface ProviderModelEditDialogProps {
  open: boolean;
  initialDraft: ProviderModelDraft;
  onOpenChange: (open: boolean) => void;
  onApply: (draft: ProviderModelDraft, validation: { requiresValidation: boolean; validated: boolean }) => void;
}

export function ProviderModelEditDialog({
  open,
  initialDraft,
  onOpenChange,
  onApply,
}: ProviderModelEditDialogProps) {
  const steps: Array<{
    key: "provider" | "auth" | "model";
    title: string;
    subtitle: string;
  }> = [
    { key: "provider", title: "Provider", subtitle: "Choose provider" },
    { key: "auth", title: "Authentication", subtitle: "Select and verify auth" },
    { key: "model", title: "Model", subtitle: "Pick default model" },
  ];
  const [draft, setDraft] = useState<ProviderModelDraft>(initialDraft);
  const [stepIndex, setStepIndex] = useState(0);
  const [validation, setValidation] = useState({
    requiresValidation: false,
    validated: true,
  });

  useEffect(() => {
    if (open) {
      setDraft(initialDraft);
      setStepIndex(0);
      setValidation({ requiresValidation: false, validated: true });
    }
  }, [open, initialDraft]);

  const selectedGroup = findProviderGroup(draft.providerId);
  const selectedMethod = findAuthMethod(draft.methodId);
  const applyBlockedReason = useMemo(() => {
    if (selectedMethod?.type === "custom" && !draft.baseUrl.trim()) {
      return "Custom provider requires Base URL.";
    }
    if (validation.requiresValidation && !validation.validated) {
      return "Please verify credentials before applying.";
    }
    if (!draft.modelId.trim()) {
      return "Please choose a default model.";
    }
    return null;
  }, [selectedMethod?.type, draft.baseUrl, draft.modelId, validation]);
  const currentStep = steps[stepIndex]?.key ?? "provider";
  const nextBlockedReason = useMemo(() => {
    if (currentStep === "provider") {
      if (!draft.providerId) {
        return "Please choose a provider.";
      }
      return null;
    }
    if (currentStep === "auth") {
      if (!draft.methodId) {
        return "Please choose an auth method.";
      }
      if (selectedMethod?.type === "custom" && !draft.baseUrl.trim()) {
        return "Custom provider requires Base URL.";
      }
      if (validation.requiresValidation && !validation.validated) {
        return "Please verify credentials before continuing.";
      }
      return null;
    }
    return null;
  }, [
    currentStep,
    draft.providerId,
    draft.methodId,
    draft.baseUrl,
    selectedMethod?.type,
    validation.requiresValidation,
    validation.validated,
  ]);
  const hideFooterValidationHint =
    currentStep === "auth" &&
    nextBlockedReason === "Please verify credentials before continuing.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit Provider Configuration</DialogTitle>
          <DialogDescription>
            Configure provider in three steps: choose provider, authenticate, then pick the default model.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto py-3">
          <div className="flex w-full items-stretch gap-2 sm:gap-3">
            {steps.map((step, idx) => {
              const isCurrent = idx === stepIndex;
              const isDone = idx < stepIndex;
              return (
                <div key={step.key} className="flex min-w-0 flex-1 items-stretch gap-2 sm:gap-3">
                  <div
                    className={[
                      "flex w-full min-w-0 items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
                      isCurrent
                        ? "border-primary bg-primary/5"
                        : isDone
                          ? "border-emerald-500/40 bg-emerald-500/5"
                          : "border-border bg-muted/20",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "inline-flex size-8 items-center justify-center rounded-full text-xs font-semibold",
                        isCurrent
                          ? "bg-primary text-primary-foreground"
                          : isDone
                            ? "bg-emerald-600 text-white"
                            : "bg-muted text-muted-foreground",
                      ].join(" ")}
                    >
                      {idx + 1}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={[
                          "block truncate text-sm font-semibold",
                          isCurrent || isDone ? "text-foreground" : "text-muted-foreground",
                        ].join(" ")}
                      >
                        {step.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {step.subtitle}
                      </span>
                    </span>
                  </div>
                  {idx < steps.length - 1 ? (
                    <span className="flex items-center justify-center self-stretch">
                      <ChevronRightIcon className="size-4 text-muted-foreground/70" />
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <ProviderModelSection
          mode="dialog"
          step={currentStep}
          selectedProviderId={draft.providerId}
          selectedMethodId={draft.methodId}
          modelId={draft.modelId}
          apiKey={draft.apiKey}
          baseUrl={draft.baseUrl}
          onProviderChange={(group) => {
            const method =
              group.methods.find((m) => m.type === "oauth") ?? group.methods[0];
            setDraft((prev) => ({
              ...prev,
              providerId: group.id,
              methodId: method.id,
              modelId: method.defaultModelId ?? prev.modelId,
              apiKey: "",
              baseUrl: "",
            }));
          }}
          onMethodChange={(method) => {
            setDraft((prev) => ({
              ...prev,
              methodId: method.id,
              modelId: method.defaultModelId ?? prev.modelId,
            }));
          }}
          onModelChange={(modelId) =>
            setDraft((prev) => ({
              ...prev,
              modelId,
            }))
          }
          onApiKeyChange={(apiKey) =>
            setDraft((prev) => ({
              ...prev,
              apiKey,
            }))
          }
          onBaseUrlChange={(baseUrl) =>
            setDraft((prev) => ({
              ...prev,
              baseUrl,
            }))
          }
          onValidationStateChange={setValidation}
        />

        <DialogFooter className="items-center">
          <div className="mr-auto text-xs text-muted-foreground">
            {selectedGroup?.label ?? draft.providerId}
            {" · "}
            {selectedMethod?.label ?? "No auth method"}
          </div>
          {stepIndex < steps.length - 1 && nextBlockedReason && !hideFooterValidationHint ? (
            <p className="mr-2 text-xs text-amber-700">{nextBlockedReason}</p>
          ) : null}
          {stepIndex === steps.length - 1 && applyBlockedReason ? (
            <p className="mr-2 text-xs text-amber-700">{applyBlockedReason}</p>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {stepIndex > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
            >
              Back
            </Button>
          ) : null}
          {stepIndex < steps.length - 1 ? (
            <Button
              type="button"
              disabled={!!nextBlockedReason}
              onClick={() =>
                setStepIndex((prev) => Math.min(steps.length - 1, prev + 1))
              }
            >
              Next
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!!applyBlockedReason}
              onClick={() => {
                onApply(draft, validation);
                onOpenChange(false);
              }}
            >
              Apply
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
