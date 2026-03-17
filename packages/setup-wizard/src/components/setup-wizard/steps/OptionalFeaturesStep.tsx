import { MessageCircle, Globe, Folder } from "lucide-react";
import { useState } from "react";
import { useWizardStore } from "@/store/setup-wizard.store";

interface OptionalFeaturesStepProps {
  onNext: () => void;
  onBack: () => void;
}

const FEATURES = [
  {
    id: "messaging",
    icon: MessageCircle,
    title: "Messaging",
    description: "Stay connected with built-in chat features",
    enabled: true,
  },
  {
    id: "browser",
    icon: Globe,
    title: "Browser",
    description: "Browse the web without leaving the app",
    enabled: false,
  },
  {
    id: "fileAccess",
    icon: Folder,
    title: "Files",
    description: "Manage and store your documents securely",
    enabled: true,
  },
];

export function OptionalFeaturesStep({ onNext: _onNext }: OptionalFeaturesStepProps) {
  const { wizardState, updateWizardState } = useWizardStore();
  const [features, setFeatures] = useState(wizardState.optionalFeatures || {});

  const handleToggle = (featureId: string) => {
    const updated = {
      ...features,
      [featureId]: !features[featureId as keyof typeof features],
    };
    setFeatures(updated);
    updateWizardState({ optionalFeatures: updated });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
          Optional Features
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-lg leading-snug">
          Enhance your experience with these additional tools. You can change these later in
          settings.
        </p>
      </div>

      {/* Feature List */}
      <div className="space-y-3">
        {FEATURES.map((feature) => {
          const IconComponent = feature.icon;
          return (
            <div
              key={feature.id}
              className="flex items-center gap-4 bg-white dark:bg-white/5 p-4 rounded-xl border border-slate-100 dark:border-white/10 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0 size-12">
                <IconComponent className="w-6 h-6" />
              </div>
              <div className="flex flex-col flex-1">
                <p className="text-slate-900 dark:text-slate-100 text-base font-semibold leading-none">
                  {feature.title}
                </p>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 leading-tight">
                  {feature.description}
                </p>
              </div>
              <div className="shrink-0">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={features[feature.id as keyof typeof features] || false}
                    onChange={() => handleToggle(feature.id)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-white/10 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary" />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {/* Helper Text */}
      <div className="mt-8 text-center px-4">
        <p className="text-slate-400 dark:text-slate-500 text-xs uppercase tracking-widest font-bold">
          Adjustable in Settings
        </p>
        <p className="text-slate-400 dark:text-slate-500 text-xs mt-2">
          Adding these features may use additional storage and require certain permissions.
        </p>
      </div>
    </div>
  );
}
