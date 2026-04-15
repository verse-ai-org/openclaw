import { useEffect, useState } from "react";
import { SaveIcon, Loader2Icon, RotateCcwIcon, EyeIcon } from "lucide-react";
import {
  ProviderModelEditDialog,
  ProviderModelSummaryCard,
  buildProviderModelPatchOps,
  deriveProviderModelState,
} from "@/components/settings/provider-model";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { findAuthMethod, findProviderGroup } from "@/data/auth-choice-groups";
import { cn } from "@/lib/utils";
import { useAgentsStore } from "@/store/agents.store";
import { useGatewayStore } from "@/store/gateway.store";
import type { AgentConfigEntry, AgentConfigSnapshot } from "@/types/agents";

function AgentConfigRow({
  agent,
  modelOptions,
  inheritedModel,
  onModelChange,
}: {
  agent: AgentConfigEntry;
  modelOptions: string[];
  inheritedModel: string;
  onModelChange: (agentId: string, val: string) => void;
}) {
  const primaryModel =
    typeof agent.model === "string"
      ? agent.model
      : typeof agent.model === "object" && agent.model != null
        ? (((agent.model as Record<string, unknown>).primary as
            | string
            | undefined) ?? "")
        : "";

  return (
    <div className="grid grid-cols-[1fr_2fr] gap-3 items-center py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{agent.name ?? agent.id}</p>
        <p className="text-xs text-muted-foreground font-mono truncate">
          {agent.id}
        </p>
      </div>
      <Select
        value={primaryModel || "__inherit__"}
        onValueChange={(value) =>
          onModelChange(agent.id, value === "__inherit__" ? "" : value)
        }
      >
        <SelectTrigger className="h-7 w-full text-xs font-mono">
          <SelectValue placeholder="inherit default" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__inherit__">
            {inheritedModel ? `default: ${inheritedModel}` : "inherit default"}
          </SelectItem>
          {modelOptions.map((model) => (
            <SelectItem key={model} value={model} className="font-mono text-xs">
              {model}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ConfigPage() {
  const isConnected = useGatewayStore((s) => s.status === "connected");
  const configForm = useAgentsStore(
    (s) => s.configForm,
  ) as AgentConfigSnapshot | null;
  const configLoading = useAgentsStore((s) => s.configLoading);
  const configSaving = useAgentsStore((s) => s.configSaving);
  const configDirty = useAgentsStore((s) => s.configDirty);
  const loadConfig = useAgentsStore((s) => s.loadConfig);
  const patchConfig = useAgentsStore((s) => s.patchConfig);
  const saveConfig = useAgentsStore((s) => s.saveConfig);
  const reloadConfig = useAgentsStore((s) => s.reloadConfig);
  const changeAgentModel = useAgentsStore((s) => s.changeAgentModel);
  const [editOpen, setEditOpen] = useState(false);
  const [rawConfigOpen, setRawConfigOpen] = useState(false);
  const [providerValidation, setProviderValidation] = useState<{
    requiresValidation: boolean;
    validated: boolean;
  }>({ requiresValidation: false, validated: true });

  useEffect(() => {
    if (isConnected && !configForm) {
      void loadConfig();
    }
  }, [isConnected, configForm, loadConfig]);

  const agentList: AgentConfigEntry[] = configForm?.agents?.list ?? [];
  const providerState = deriveProviderModelState(configForm);
  const selectedGroup = findProviderGroup(providerState.providerId);
  const selectedMethod = findAuthMethod(providerState.methodId);
  const providerModelsFromConfig =
    (((configForm?.models?.providers as Record<string, unknown> | undefined)?.[
      providerState.providerId
    ] as Record<string, unknown> | undefined)?.models as
      | Array<Record<string, unknown>>
      | undefined) ?? [];
  const configuredModelOptions = providerModelsFromConfig
    .map((m) => (typeof m.id === "string" ? m.id : ""))
    .filter((id): id is string => !!id.trim())
    .map((id) => (id.includes("/") ? id : `${providerState.providerId}/${id}`));
  const modelOptions = Array.from(
    new Set(
      [
        ...configuredModelOptions,
        ...(selectedGroup?.methods ?? [])
          .map((m) => m.defaultModelId ?? "")
          .filter((id): id is string => !!id.trim()),
      ],
    ),
  );
  const methodStatus = (() => {
    if (!selectedMethod) {
      return { label: "Unknown", tone: "neutral" as const };
    }
    if (selectedMethod.type === "oauth") {
      return { label: "OAuth", tone: "neutral" as const };
    }
    if (selectedMethod.type === "custom") {
      const ready = !!providerState.apiKey.trim() && !!providerState.baseUrl.trim();
      return {
        label: ready ? "Configured" : "Missing config",
        tone: ready ? ("success" as const) : ("warning" as const),
      };
    }
    if (selectedMethod.type === "api-key" || selectedMethod.type === "proxy") {
      const ready = !!providerState.apiKey.trim();
      return {
        label: ready ? "Configured" : "Missing credential",
        tone: ready ? ("success" as const) : ("warning" as const),
      };
    }
    return { label: "Unknown", tone: "neutral" as const };
  })();
  const saveBlockedReason =
    providerValidation.requiresValidation && !providerValidation.validated
      ? "Please verify provider credentials before saving."
      : null;

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Not connected to gateway.
      </div>
    );
  }

  if (configLoading && !configForm) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        <span className="text-sm">Loading config…</span>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-6 p-8 max-w-4xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <h2 className="text-[48px] font-extrabold leading-tight tracking-tight text-foreground">
              Settings
            </h2>
            <p className="text-lg font-medium text-muted-foreground">
              Server system configuration.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Provider verification
              </span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                  providerValidation.requiresValidation
                    ? providerValidation.validated
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {!providerValidation.requiresValidation
                  ? "Not required"
                  : providerValidation.validated
                    ? "Verified"
                    : "Pending"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={configLoading}
              onClick={() => void reloadConfig()}
            >
              <RotateCcwIcon className="size-3.5 mr-1.5" />
              Reload
            </Button>
            <Button
              size="sm"
              disabled={!configDirty || configSaving || !!saveBlockedReason}
              onClick={() => void saveConfig()}
              className={cn(configDirty && "border-amber-500")}
              title={saveBlockedReason ?? undefined}
            >
              {configSaving ? (
                <Loader2Icon className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <SaveIcon className="size-3.5 mr-1.5" />
              )}
              Save
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Provider Configuration</CardTitle>
            <CardDescription>
              Active provider, authentication method, and default model configuration.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProviderModelSummaryCard
              providerId={providerState.providerId}
              providerLabel={providerState.providerLabel}
              methodLabel={providerState.methodLabel}
              methodStatusLabel={methodStatus.label}
              methodStatusTone={methodStatus.tone}
              modelId={providerState.modelId}
              modelOptions={modelOptions}
              onModelChange={(modelId) =>
                patchConfig(
                  ["agents", "defaults", "model"],
                  modelId ? { primary: modelId } : undefined,
                )
              }
              onEdit={() => setEditOpen(true)}
            />
            {saveBlockedReason ? (
              <p className="text-xs text-amber-700">{saveBlockedReason}</p>
            ) : null}
            <ProviderModelEditDialog
              open={editOpen}
              initialDraft={{
                providerId: providerState.providerId,
                methodId: providerState.methodId,
                modelId: providerState.modelId,
                apiKey: providerState.apiKey,
                baseUrl: providerState.baseUrl,
              }}
              onOpenChange={setEditOpen}
              onApply={(draft, validation) => {
                setProviderValidation(validation);
                for (const op of buildProviderModelPatchOps(draft)) {
                  patchConfig(op.path, op.value);
                }
              }}
            />
          </CardContent>
        </Card>

        {/* Per-agent model overrides */}
        {agentList.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Everyone's Model</CardTitle>
              <CardDescription>
                Everyone's model override.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {agentList.map((agent) => (
                <AgentConfigRow
                  key={agent.id}
                  agent={agent}
                  modelOptions={modelOptions}
                  inheritedModel={providerState.modelId}
                  onModelChange={changeAgentModel}
                />
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Raw Config</CardTitle>
            <CardDescription>
              Open the full read-only JSON config in a dialog.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog open={rawConfigOpen} onOpenChange={setRawConfigOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <EyeIcon className="size-3.5 mr-1.5" />
                  View Detailed Config
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-4xl max-h-[85vh]">
                <DialogHeader>
                  <DialogTitle>Raw Config JSON</DialogTitle>
                </DialogHeader>
                <div className="overflow-auto rounded border border-border bg-muted/20 p-3 max-h-[70vh]">
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                    {JSON.stringify(configForm, null, 2)}
                  </pre>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
