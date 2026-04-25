import {
  CheckCircle2Icon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  RefreshCwIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  findAuthMethod,
  findProviderGroup,
  PROVIDER_MODEL_CANDIDATES,
} from "@/data/auth-choice-groups";
import { useOptionalWizardAdapter } from "@/context/AdapterContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AuthMethodTabs } from "./AuthMethodTabs";
import { ProviderPicker } from "./ProviderPicker";
import type { ProviderModelSectionProps } from "./types";

type ElectronBridgeLike = {
  validateApiKey?: (
    authMethod: string,
    apiKey: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  oauthStart?: (authMethod: string) => Promise<{
    ok: boolean;
    userCode?: string;
    verificationUri?: string;
    error?: string;
  }>;
  oauthPoll?: (authMethod: string) => Promise<{
    ok: boolean;
    token?: string;
    refresh?: string;
    expires?: number;
    error?: string;
  }>;
  oauthCancel?: (authMethod: string) => Promise<{ ok: boolean }>;
};

function getElectronBridge(): ElectronBridgeLike | null {
  const maybeWindow = window as Window & { electronBridge?: ElectronBridgeLike };
  return maybeWindow.electronBridge ?? null;
}

export function ProviderModelSection({
  selectedProviderId,
  selectedMethodId,
  modelId,
  apiKey,
  baseUrl,
  onProviderChange,
  onMethodChange,
  onModelChange,
  onApiKeyChange,
  onBaseUrlChange,
  mode = "full",
  step,
  onValidationStateChange,
}: ProviderModelSectionProps) {
  const adapter = useOptionalWizardAdapter();
  const selectedGroup = selectedProviderId
    ? findProviderGroup(selectedProviderId)
    : undefined;
  const selectedMethod = selectedMethodId
    ? findAuthMethod(selectedMethodId)
    : undefined;
  const providerSummary = selectedGroup
    ? `${selectedGroup.label} · ${selectedMethod?.label ?? "No method selected"}`
    : "No provider selected";
  const configPaths = selectedProviderId
    ? [
        "agents.defaults.model.primary",
        `models.providers.${selectedProviderId}.auth`,
        `models.providers.${selectedProviderId}.apiKey`,
        ...(selectedMethod?.type === "custom"
          ? [`models.providers.${selectedProviderId}.baseUrl`]
          : []),
      ]
    : ["agents.defaults.model.primary"];
  const [testing, setTesting] = useState(false);
  const [revealCredential, setRevealCredential] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [oauthPhase, setOauthPhase] = useState<
    "idle" | "opening" | "polling" | "success" | "error"
  >("idle");
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [deviceCode, setDeviceCode] = useState<{
    userCode: string;
    verificationUri: string;
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const modelOptions = useMemo(() => {
    const list = (selectedGroup?.methods ?? [])
      .map((m) => m.defaultModelId ?? "")
      .filter((m): m is string => !!m.trim());
    return Array.from(
      new Set([
        ...list,
        ...(selectedProviderId ? (PROVIDER_MODEL_CANDIDATES[selectedProviderId] ?? []) : []),
      ]),
    );
  }, [selectedGroup, selectedProviderId]);
  const requiresValidation =
    selectedMethod?.type === "api-key" ||
    selectedMethod?.type === "custom" ||
    selectedMethod?.type === "proxy";
  const validated =
    selectedMethod?.type === "oauth"
      ? oauthPhase === "success"
      : !requiresValidation || testResult === "success";

  useEffect(() => {
    setTestResult(null);
    setTestError(null);
    setRevealCredential(false);
    setOauthPhase("idle");
    setOauthError(null);
    setDeviceCode(null);
  }, [selectedMethodId, selectedProviderId]);

  useEffect(() => {
    onValidationStateChange?.({
      requiresValidation: !!requiresValidation,
      validated,
    });
  }, [onValidationStateChange, requiresValidation, validated]);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const validateCredentials = async (methodId: string, key: string) => {
    if (adapter?.validateApiKey) {
      return adapter.validateApiKey(methodId, key);
    }
    const bridge = getElectronBridge();
    if (bridge?.validateApiKey) {
      return bridge.validateApiKey(methodId, key);
    }
    return {
      ok: false,
      error: "Credential validation is unavailable in this runtime.",
    };
  };

  const handleTestConnection = async () => {
    if (!selectedMethod) {
      return;
    }
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setTestResult("error");
      setTestError("API key cannot be empty.");
      return;
    }
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const result = await validateCredentials(selectedMethod.id, trimmed);
      if (result.ok) {
        setTestResult("success");
      } else {
        setTestResult("error");
        setTestError(result.error ?? "Validation failed.");
      }
    } catch (err) {
      setTestResult("error");
      setTestError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setTesting(false);
    }
  };

  const handleClearCredential = () => {
    onApiKeyChange("");
    if (selectedMethod?.type === "custom") {
      onBaseUrlChange("");
    }
    setTestResult(null);
    setTestError(null);
  };

  const handleStartOAuth = async () => {
    if (!selectedMethod) {
      return;
    }
    const bridge = getElectronBridge();
    const startOAuth = adapter?.startOAuth ?? bridge?.oauthStart;
    const pollOAuth = adapter?.pollOAuth ?? bridge?.oauthPoll;
    if (!startOAuth) {
      setOauthPhase("error");
      setOauthError("OAuth is not available in the current runtime.");
      return;
    }
    setOauthPhase("opening");
    setOauthError(null);
    setDeviceCode(null);
    try {
      const startResult = await startOAuth(selectedMethod.id);
      if (!startResult.ok) {
        setOauthPhase("error");
        setOauthError(startResult.error ?? "Failed to open OAuth flow.");
        return;
      }
      if (startResult.userCode && startResult.verificationUri) {
        setDeviceCode({
          userCode: startResult.userCode,
          verificationUri: startResult.verificationUri,
        });
      }
      if (!pollOAuth) {
        setOauthPhase("success");
        return;
      }
      setOauthPhase("polling");
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const result = await pollOAuth(selectedMethod.id);
          if (!result) {
            return;
          }
          if (result.ok) {
            stopPolling();
            setOauthPhase("success");
            if (result.token) {
              onApiKeyChange(result.token);
            }
            return;
          }
          if (result.error === "pending") {
            return;
          }
          stopPolling();
          setOauthPhase("error");
          setOauthError(result.error ?? "OAuth failed.");
        } catch (err) {
          stopPolling();
          setOauthPhase("error");
          setOauthError(err instanceof Error ? err.message : "OAuth polling failed.");
        }
      }, 2000);
    } catch (err) {
      setOauthPhase("error");
      setOauthError(err instanceof Error ? err.message : "OAuth start failed.");
    }
  };

  const handleResetOAuth = async () => {
    if (!selectedMethod) {
      return;
    }
    stopPolling();
    const bridge = getElectronBridge();
    if (adapter?.cancelOAuth) {
      await adapter.cancelOAuth(selectedMethod.id);
    } else if (bridge?.oauthCancel) {
      await bridge.oauthCancel(selectedMethod.id);
    }
    setOauthPhase("idle");
    setOauthError(null);
    setDeviceCode(null);
  };

  const isDialog = mode === "dialog";
  const activeStep = step ?? "provider";
  const showProviderStep = activeStep === "provider";
  const showAuthStep = activeStep === "auth";
  const showModelStep = activeStep === "model";

  return (
    <div className="space-y-5">
      {!isDialog ? (
        <>
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Active configuration:{" "}
            <span className="font-medium text-foreground">{providerSummary}</span>
          </div>
          <div className="rounded-md border border-dashed border-border bg-background px-3 py-2">
            <p className="text-[11px] font-medium text-muted-foreground">
              Config paths updated on save
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {configPaths.map((path) => (
                <code
                  key={path}
                  className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground"
                >
                  {path}
                </code>
              ))}
            </div>
          </div>
        </>
      ) : null}
      {showProviderStep ? (
        <div className="space-y-1.5">
          <ProviderPicker
            selectedProviderId={selectedProviderId}
            onSelect={onProviderChange}
          />
        </div>
      ) : null}

      {showAuthStep && selectedGroup && selectedGroup.methods.length > 1 ? (
        <div className="space-y-1.5">
          <Label className="text-xs">Auth method</Label>
          <AuthMethodTabs
            methods={selectedGroup.methods}
            selectedMethodId={selectedMethodId}
            onSelect={onMethodChange}
          />
        </div>
      ) : null}

      {showAuthStep && selectedMethod ? (
        <>
          {selectedMethod.type === "oauth" ? (
            <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Authenticate provider and persist returned token to config.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant={oauthPhase === "success" ? "outline" : "default"}
                  onClick={() => {
                    void handleStartOAuth();
                  }}
                  disabled={oauthPhase === "opening" || oauthPhase === "polling"}
                >
                  {oauthPhase === "opening" || oauthPhase === "polling" ? (
                    <>
                      <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />
                      Waiting
                    </>
                  ) : oauthPhase === "success" ? (
                    <>
                      <CheckCircle2Icon className="mr-1.5 size-3.5" />
                      Authenticated
                    </>
                  ) : (
                    "Authenticate"
                  )}
                </Button>
              </div>
              {deviceCode ? (
                <div className="rounded-md bg-background p-2 text-xs">
                  <p className="text-muted-foreground">Device Code</p>
                  <p className="font-mono text-sm font-semibold tracking-[0.25em]">
                    {deviceCode.userCode}
                  </p>
                  <a
                    href={deviceCode.verificationUri}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {deviceCode.verificationUri}
                  </a>
                </div>
              ) : null}
              {oauthPhase === "error" ? (
                <div className="flex items-center gap-2 text-xs text-red-600">
                  <XCircleIcon className="size-3.5" />
                  <span>{oauthError ?? "OAuth failed."}</span>
                </div>
              ) : null}
              {(oauthPhase === "error" || oauthPhase === "success") && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void handleResetOAuth();
                  }}
                >
                  <RefreshCwIcon className="mr-1.5 size-3.5" />
                  Reset OAuth
                </Button>
              )}
            </div>
          ) : null}

          {(selectedMethod.type === "api-key" ||
            selectedMethod.type === "custom" ||
            selectedMethod.type === "proxy") ? (
            <div className="space-y-1.5">
              <Label className="text-xs">
                {selectedMethod.type === "proxy" ? "Access token / key" : "API key"}
              </Label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type={revealCredential ? "text" : "password"}
                    value={apiKey}
                    placeholder={selectedMethod.keyPlaceholder ?? "Paste credential"}
                    className="pr-16 text-sm font-mono"
                    onChange={(e) => onApiKeyChange(e.target.value)}
                  />
                  {apiKey.trim() ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="absolute right-1 top-1.5 size-6 text-muted-foreground hover:text-foreground"
                      onClick={handleClearCredential}
                      aria-label="Clear credential"
                    >
                      <XIcon className="size-3.5" />
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className={[
                      "absolute right-1 top-1.5 size-6 text-muted-foreground hover:text-foreground",
                      apiKey.trim() ? "right-7" : "right-1",
                    ].join(" ")}
                    onClick={() => setRevealCredential((prev) => !prev)}
                    aria-label={revealCredential ? "Hide credential" : "Show credential"}
                  >
                    {revealCredential ? (
                      <EyeOffIcon className="size-3.5" />
                    ) : (
                      <EyeIcon className="size-3.5" />
                    )}
                  </Button>
                </div>
                <Button
                  type="button"
                  variant={testResult === "success" ? "outline" : "default"}
                  onClick={() => {
                    void handleTestConnection();
                  }}
                  disabled={testing || !apiKey.trim()}
                >
                  {testing ? (
                    <>
                      <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />
                      Testing
                    </>
                  ) : testResult === "success" ? (
                    <>
                      <CheckCircle2Icon className="mr-1.5 size-3.5" />
                      Connected
                    </>
                  ) : (
                    "Test Connection"
                  )}
                </Button>
              </div>
              {testResult === "error" ? (
                <p className="text-xs text-red-600">
                  {testError ?? "Validation failed."}
                </p>
              ) : null}
              {requiresValidation && !validated ? (
                <p className="text-xs text-amber-700">
                  Please verify credentials before continuing.
                </p>
              ) : null}
            </div>
          ) : null}

          {selectedMethod.type === "custom" ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Base URL</Label>
              <Input
                value={baseUrl}
                placeholder="https://your-endpoint.example.com/v1"
                className="text-sm font-mono"
                onChange={(e) => onBaseUrlChange(e.target.value)}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {showModelStep ? (
        <div className="space-y-1.5">
          <Label className="text-xs">Default model</Label>
          {modelOptions.length > 0 ? (
            <Select
              value={modelId || undefined}
              onValueChange={(value) => onModelChange(value)}
            >
              <SelectTrigger className="h-8 w-full text-sm font-mono">
                <SelectValue placeholder="Select a model for this provider" />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((model) => (
                  <SelectItem key={model} value={model} className="font-mono">
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-muted-foreground">
              No models configured for this provider in auth-choice groups.
            </p>
          )}
          {!modelId.trim() ? (
            <p className="text-xs text-amber-700">
              Please choose a default model before applying.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
