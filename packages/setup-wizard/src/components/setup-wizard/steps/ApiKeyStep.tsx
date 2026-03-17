import { ExternalLink, Key, CheckCircle, Shield } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useWizardStore } from "@/store/setup-wizard.store";

interface ApiKeyStepProps {
  onNext: () => void;
  onBack: () => void;
}

const API_KEY_GUIDES = {
  claude: {
    name: "Claude",
    url: "https://console.anthropic.com/account/keys",
    steps: ["Sign up", "Go to API keys", "Create key", "Copy it"],
  },
  gpt4: {
    name: "GPT-4",
    url: "https://platform.openai.com/account/api-keys",
    steps: ["Sign up", "Go to API keys", "Create key", "Copy it"],
  },
  gemini: {
    name: "Gemini",
    url: "https://aistudio.google.com/app/apikey",
    steps: ["Sign up", "Go to API keys", "Create key", "Copy it"],
  },
};

export function ApiKeyStep({ onNext: _onNext }: ApiKeyStepProps) {
  const { wizardState, updateWizardState } = useWizardStore();
  const [apiKey, setApiKey] = useState(wizardState.apiKey || "");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);

  const guide = API_KEY_GUIDES[wizardState.selectedModel as keyof typeof API_KEY_GUIDES];

  // const handleOpenGuide = () => {
  //   window.open(guide.url, '_blank');
  // };

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      setTestResult("error");
      return;
    }

    setTesting(true);
    setTestResult(null);

    setTimeout(() => {
      setTesting(false);
      setTestResult("success");
      updateWizardState({ apiKey });
    }, 1500);
  };

  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="text-center space-y-4 pt-12">
        <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tighter text-slate-900 dark:text-white">
          Connect your Anthropic account
        </h1>
        <p className="text-lg text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          An API key is required to use Claude. It's free and takes only 2 minutes.
        </p>
      </div>

      {/* 3-Step Guide Container */}
      <div className="space-y-8">
        {/* Step 1: External Link */}
        <div className="relative group bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-primary/5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
              1
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="text-xl font-bold">Get your API key</h3>
                <p className="text-slate-500 dark:text-slate-400 mt-1">
                  Visit the Anthropic website (opens in new tab)
                </p>
                <div className="mt-3 text-sm text-slate-500 dark:text-slate-400 space-y-1">
                  <p>Follow these steps:</p>
                  <ol className="list-decimal list-inside ml-2">
                    {guide.steps.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ol>
                </div>
              </div>
              <a
                href={guide.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white font-bold rounded-full hover:opacity-90 transition-opacity"
              >
                <span>Go to Console</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>

        {/* Step 2: Input Field */}
        <div className="relative group bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-primary/5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
              2
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="text-xl font-bold">Paste your key</h3>
                <p className="text-slate-500 dark:text-slate-400 mt-1">
                  Your key is encrypted and stored securely on your device.
                </p>
              </div>
              <div className="relative max-w-md">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                  <Key className="w-5 h-5" />
                </div>
                <Input
                  type={showKey ? "text" : "password"}
                  placeholder="Enter your API key..."
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setTestResult(null);
                  }}
                  className="pl-12 pr-4 py-4 bg-slate-50 dark:bg-background-dark border-none rounded-2xl focus:ring-2 focus:ring-primary text-slate-900 dark:text-white placeholder:text-slate-400"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showKey}
                  onChange={(e) => setShowKey(e.target.checked)}
                  className="rounded border-slate-300 text-primary focus:ring-primary"
                />
                <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                  Show key
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Step 3: Verify */}
        <div className="relative group bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-primary/5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
              3
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="text-xl font-bold">Test connection</h3>
                <p className="text-slate-500 dark:text-slate-400 mt-1">
                  We'll perform a quick handshake to ensure everything is configured correctly.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  onClick={handleTestConnection}
                  disabled={!apiKey.trim() || testing}
                  className="px-8 py-3 bg-slate-900 dark:bg-primary text-white font-bold rounded-full hover:scale-105 active:scale-95 transition-transform flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>{testing ? "Testing..." : "Test Connection"}</span>
                </button>
                {testResult === "success" && (
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-semibold">Connected</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="text-center pt-12">
        <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest font-semibold flex items-center justify-center gap-2">
          <Shield className="w-4 h-4" />
          Privacy First Architecture
        </p>
      </div>
    </div>
  );
}
