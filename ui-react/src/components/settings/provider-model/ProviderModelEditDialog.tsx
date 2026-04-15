import { useEffect, useMemo, useState } from "react";
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
  const steps: Array<{ key: "provider" | "auth" | "model"; label: string }> = [
    { key: "provider", label: "Choose provider" },
    { key: "auth", label: "Select auth and verify" },
    { key: "model", label: "Pick default model" },
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit Provider Configuration</DialogTitle>
          <DialogDescription>
            Configure provider in three steps: choose provider, authenticate, then pick the default model.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground sm:grid-cols-3">
          {steps.map((step, idx) => (
            <div
              key={step.key}
              className={[
                "rounded-md px-2 py-1",
                idx === stepIndex
                  ? "bg-primary/10 text-primary"
                  : "bg-background text-muted-foreground",
              ].join(" ")}
            >
              <span className="font-semibold text-foreground">{idx + 1}.</span>{" "}
              {step.label}
            </div>
          ))}
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
          {stepIndex < steps.length - 1 && nextBlockedReason ? (
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
