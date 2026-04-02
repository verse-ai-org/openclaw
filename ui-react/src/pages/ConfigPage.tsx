import { useEffect } from "react";
import { SaveIcon, Loader2Icon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAgentsStore } from "@/store/agents.store";
import { useGatewayStore } from "@/store/gateway.store";
import type { AgentConfigEntry, AgentConfigSnapshot } from "@/types/agents";

function AgentConfigRow({
  agent,
  onModelChange,
}: {
  agent: AgentConfigEntry;
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
    <div className="grid grid-cols-[1fr_2fr] gap-3 items-center py-2 border-b last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{agent.name ?? agent.id}</p>
        <p className="text-xs text-muted-foreground font-mono truncate">
          {agent.id}
        </p>
      </div>
      <Input
        value={primaryModel}
        placeholder="inherit default"
        className="h-7 text-xs font-mono"
        onChange={(e) => onModelChange(agent.id, e.target.value)}
      />
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

  useEffect(() => {
    if (isConnected && !configForm) {
      void loadConfig();
    }
  }, [isConnected, configForm, loadConfig]);

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

  const agentList: AgentConfigEntry[] = configForm?.agents?.list ?? [];
  const defaults = configForm?.agents?.defaults;
  const globalModel =
    typeof defaults?.model === "string"
      ? defaults.model
      : typeof defaults?.model === "object" && defaults?.model != null
        ? (((defaults.model as Record<string, unknown>).primary as
            | string
            | undefined) ?? "")
        : "";

  const handleGlobalModelChange = (val: string) => {
    const current =
      (configForm?.agents?.defaults?.model as
        | Record<string, unknown>
        | undefined) ?? {};
    const next =
      typeof current === "object"
        ? { ...current, primary: val }
        : { primary: val };
    patchConfig(["agents", "defaults", "model"], val ? next : undefined);
  };

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
              disabled={!configDirty || configSaving}
              onClick={() => void saveConfig()}
              className={cn(configDirty && "border-amber-500 text-amber-600")}
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

        {/* Global defaults */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Global Defaults</CardTitle>
            <CardDescription>
              Applied to all agents unless overridden.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Default model</Label>
              <Input
                value={globalModel}
                placeholder="e.g. claude-opus-4-5"
                className="h-8 text-sm font-mono"
                onChange={(e) => handleGlobalModelChange(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Per-agent model overrides */}
        {agentList.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Agent Models</CardTitle>
              <CardDescription>
                Per-agent primary model overrides.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {agentList.map((agent) => (
                <AgentConfigRow
                  key={agent.id}
                  agent={agent}
                  onModelChange={changeAgentModel}
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Raw JSON viewer */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Raw Config</CardTitle>
            <CardDescription>
              Read-only view of the full config object.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono bg-muted/40 rounded p-3 overflow-auto max-h-96 whitespace-pre-wrap break-all">
              {JSON.stringify(configForm, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
