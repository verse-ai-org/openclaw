import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState } from "react";
import { useWizardStore } from "@/store/setup-wizard.store";
import { Header } from "./Header";
import { ProgressBar } from "./ProgressBar";
import { ApiKeyStep } from "./steps/ApiKeyStep";
import { CompletionStep } from "./steps/CompletionStep";
import { ModelSelectionStep } from "./steps/ModelSelectionStep";
import { OptionalFeaturesStep } from "./steps/OptionalFeaturesStep";
import { SecurityStep } from "./steps/SecurityStep";
import { WelcomeStep } from "./steps/WelcomeStep";

export type WizardStep = "welcome" | "security" | "model" | "api-key" | "features" | "completion";

const STEPS: { id: WizardStep; label: string }[] = [
  { id: "welcome", label: "Welcome" },
  { id: "security", label: "Security" },
  { id: "model", label: "Model" },
  { id: "api-key", label: "API Key" },
  { id: "features", label: "Features" },
  { id: "completion", label: "Completion" },
];

export function WizardContainer() {
  const [currentStep, setCurrentStep] = useState<WizardStep>("welcome");
  useWizardStore();

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);

  const handleNext = (nextStep: WizardStep) => {
    setCurrentStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = (prevStep: WizardStep) => {
    setCurrentStep(prevStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const shouldShowFooter = currentStep !== "welcome" && currentStep !== "completion";

  const renderStep = () => {
    switch (currentStep) {
      case "welcome":
        return <WelcomeStep onNext={() => handleNext("security")} />;
      case "security":
        return (
          <SecurityStep onNext={() => handleNext("model")} onBack={() => handleBack("welcome")} />
        );
      case "model":
        return (
          <ModelSelectionStep
            onNext={() => handleNext("api-key")}
            onBack={() => handleBack("security")}
          />
        );
      case "api-key":
        return (
          <ApiKeyStep onNext={() => handleNext("features")} onBack={() => handleBack("model")} />
        );
      case "features":
        return (
          <OptionalFeaturesStep
            onNext={() => handleNext("completion")}
            onBack={() => handleBack("api-key")}
          />
        );
      case "completion":
        return <CompletionStep onBack={() => handleBack("features")} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full grow flex-col">
      {/* Header */}
      <Header currentStep={currentStepIndex + 1} totalSteps={STEPS.length} />

      {/* Main Content */}
      <div className="px-4 md:px-40 flex flex-1 justify-center md:py-20">
        <div className="layout-content-container flex flex-col flex-1 max-w-4xl mx-auto">
          <div className="animate-in fade-in duration-300">{renderStep()}</div>
        </div>
      </div>

      {/* Footer Actions */}
      {shouldShowFooter && (
        <footer className="border-t border-slate-100 dark:border-slate-800 pt-8 pb-12 px-4 md:px-40">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <button
              onClick={() => handleBack(STEPS[currentStepIndex - 1].id)}
              className="flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 px-6 py-3 font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <ProgressBar current={currentStepIndex + 1} total={STEPS.length} />

            <button
              onClick={() => handleNext(STEPS[currentStepIndex + 1].id)}
              className="flex items-center gap-2 rounded-full bg-primary px-8 py-3 font-bold text-white shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
