import {
  CheckCircle,
  Cpu,
  Folder,
  MessageCircle,
  Globe,
  Settings,
  PlayCircle,
  Info,
} from "lucide-react";
import { useWizardStore } from "@/store/setup-wizard.store";
import { useWizardAdapter } from "@/context/AdapterContext";

interface CompletionStepProps {
  onBack: () => void;
}

export function CompletionStep(_props: CompletionStepProps) {
  const { wizardState } = useWizardStore();
  // useWizardAdapter may be null if rendered outside AdapterProvider (e.g. web)
  let adapter: ReturnType<typeof useWizardAdapter> | null = null;
  try {
    adapter = useWizardAdapter();
  } catch {
    // no adapter context — web mode, fallback to location redirect
  }

  const handleViewTutorial = () => {
    window.open("https://docs.openclaw.ai/start/getting-started", "_blank");
  };

  const handleStartChat = async () => {
    if (adapter) {
      // Electron: use complete() to persist config + restart Gateway + switch window.
      // complete() bypasses the Gateway WizardSession entirely (which would block
      // waiting for step-by-step answers), going straight to saveOnboardingConfig.
      try {
        if (typeof adapter.complete === 'function') {
          await adapter.complete();
        } else {
          await adapter.submitStep({ action: 'complete' });
        }
      } catch (err) {
        console.error('[CompletionStep] adapter.complete failed:', err);
      }
    } else {
      // Web / no-adapter fallback
      setTimeout(() => {
        window.location.href = '/chat';
      }, 500);
    }
  };

  const getModelName = () => {
    const models: Record<string, string> = {
      claude: "Claude 3.5 Sonnet",
      gpt4: "GPT-4o",
      gemini: "Gemini 2.0",
    };
    return models[wizardState.selectedModel] || "AI Model";
  };

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-4xl mx-auto w-full">
      <div className="mb-8 flex flex-col items-center">
        <div className="size-24 md:size-32 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-2xl shadow-primary/30 mb-8">
          <CheckCircle className="w-16 h-16 md:w-20 md:h-20 text-white" />
        </div>
        <div className="mb-2 px-4 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full">
          5/5
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center mb-4">
          Setup Complete!
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-lg md:text-xl text-center max-w-md">
          Your OpenClaw is ready to go.
        </p>
      </div>

      <div className="w-full max-w-lg mb-12">
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden shadow-sm">
          <div className="p-6">
            <h3 className="text-lg font-bold mb-4">Setup Summary</h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Cpu className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">AI Model: {getModelName()}</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Folder className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Workspace: ~/.openclaw/workspace</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">
                    Messaging:{" "}
                    {wizardState.optionalFeatures?.messaging ? "Connected" : "Not connected"}
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Globe className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">
                    Browser: {wizardState.optionalFeatures?.browser ? "Enabled" : "Disabled"}
                  </p>
                </div>
              </li>
              <li className="pt-2">
                <a
                  href="#"
                  className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline"
                >
                  <Settings className="w-4 h-4" />
                  Edit settings
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex flex-col w-full max-w-sm gap-4">
        <button
          onClick={handleStartChat}
          className="w-full bg-primary hover:bg-primary/90 text-white p-4 rounded-full shadow-lg shadow-primary/20 transition-all active:scale-[0.98] flex flex-col items-center"
        >
          <span className="font-bold">Start Chatting</span>
          <span className="text-xs opacity-80 font-normal">Talk to your AI directly</span>
        </button>
        <button
          onClick={handleViewTutorial}
          className="flex flex-col items-center justify-center gap-1 bg-slate-200/50 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-slate-100 p-4 rounded-full transition-all"
        >
          <PlayCircle className="w-5 h-5" />
          <span className="text-sm font-semibold">View Tutorial</span>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">
            Learn how to use OpenClaw
          </span>
        </button>
      </div>

      <footer className="py-10 flex justify-center opacity-50">
        <div className="flex items-center gap-1 text-xs">
          <Info className="w-4 h-4" />
          <span>
            You can change these settings later. Need help? Check the{" "}
            <a href="#" className="underline">
              FAQ
            </a>
            .
          </span>
        </div>
      </footer>
    </main>
  );
}
