import { useEffect, useState } from "react";
import { hydrateWizardBossimDefaults } from "@/lib/bossim-paths";
import { useWizardStore } from "@/store/setup-wizard.store";
import { WizardFooter } from "./components/WizardFooter";
import { AccessStep } from "./steps/AccessStep";
import { ApiKeyStep } from "./steps/api-key-step";
import { CompletionStep } from "./steps/CompletionStep";
import { ModelSelectionStep } from "./steps/model-selection";
import { SecurityStep } from "./steps/SecurityStep";
import { WelcomeStep } from "./steps/welcome";

export type WizardStep = "welcome" | "security" | "access" | "model" | "api-key" | "completion";

const STEPS: { id: WizardStep; label: string }[] = [
  { id: "welcome", label: "Welcome" },
  { id: "security", label: "Security" },
  { id: "access", label: "Access" },
  { id: "model", label: "Model" },
  { id: "api-key", label: "API Key" },
  { id: "completion", label: "Completion" },
];

export function WizardContainer() {
  const updateWizardState = useWizardStore((s) => s.updateWizardState);
  const [currentStep, setCurrentStep] = useState<WizardStep>("welcome");
  const [canProceed, setCanProceed] = useState(true);
  const [usedInvitePath, setUsedInvitePath] = useState(false);
  const [accessVerified, setAccessVerified] = useState(false);

  useEffect(() => {
    hydrateWizardBossimDefaults((partial) => {
      updateWizardState(partial);
    });
  }, [updateWizardState]);

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);

  const handleNext = (nextStep: WizardStep) => {
    setCanProceed(true);
    setCurrentStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = (prevStep: WizardStep) => {
    setCanProceed(true);
    setCurrentStep(prevStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const shouldShowFooter = currentStep !== "welcome" && currentStep !== "completion" && currentStep !== "api-key";

  // For access step, only allow proceed if verification is complete
  const footerCanProceed = currentStep === "access" ? accessVerified : canProceed;

  const renderStep = () => {
    switch (currentStep) {
      case "welcome":
        return <WelcomeStep onNext={() => handleNext("security")} />;
      case "security":
        return <SecurityStep onCanProceedChange={setCanProceed} />;
      case "access":
        return (
          <AccessStep
            onNextInvite={() => { setUsedInvitePath(true); handleNext("completion"); }}
            onNextManual={() => { setUsedInvitePath(false); handleNext("model"); }}
            onVerificationChange={setAccessVerified}
          />
        );
      case "model":
        return (
          <ModelSelectionStep
            onNext={() => handleNext("api-key")}
            onBack={() => handleBack("access")}
          />
        );
      case "api-key":
        return (
          <ApiKeyStep
            onNext={() => handleNext("completion")}
            onBack={() => handleBack("model")}
            onCanProceedChange={setCanProceed}
          />
        );
      case "completion":
        return <CompletionStep onBack={() => handleBack(usedInvitePath ? "access" : "api-key")} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen w-full grow flex-col">
      {/* Main Content */}
      <div className="flex flex-1 justify-center">
        <div className="layout-content-container flex flex-col flex-1 mx-auto">
          <div className="animate-in fade-in duration-300">{renderStep()}</div>
        </div>
      </div>

      {/* Footer Actions */}
      {shouldShowFooter && (
        <WizardFooter
          onBack={() => handleBack(STEPS[currentStepIndex - 1].id)}
          onNext={() => {
            // If on access step and verified via invite code, skip model selection and go straight to completion
            if (currentStep === "access" && accessVerified) {
              setUsedInvitePath(true);
              handleNext("completion");
            } else {
              handleNext(STEPS[currentStepIndex + 1].id);
            }
          }}
          canProceed={footerCanProceed}
          current={currentStepIndex + 1}
          total={STEPS.length}
        />
      )}
    </div>
  );
}
