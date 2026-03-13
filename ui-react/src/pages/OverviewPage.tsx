import { ServerIcon, UsersIcon, MessageSquareIcon, ClockIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway.store";
import { useSettingsStore } from "@/store/settings.store";

export function OverviewPage() {
  const status = useGatewayStore((s) => s.status);
  const hello = useGatewayStore((s) => s.hello);
  const serverVersion = useGatewayStore((s) => s.serverVersion);
  const presenceEntries = useGatewayStore((s) => s.presenceEntries);
  const lastError = useGatewayStore((s) => s.lastError);
  const lastErrorCode = useGatewayStore((s) => s.lastErrorCode);
  const updateAvailable = useGatewayStore((s) => s.updateAvailable);
  const settings = useSettingsStore((s) => s.settings);

  const [sessionsCount, setSessionsCount] = useState<number | null>(null);
  const [cronEnabled, setCronEnabled] = useState<boolean | null>(null);

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";

  const snapshot = hello?.snapshot as
    | { uptimeMs?: number; policy?: { tickIntervalMs?: number } }
    | undefined;

  useEffect(() => {
    if (!isConnected) {
      return;
    }
    const client = useGatewayStore.getState().client;
    if (!client) {
      return;
    }

    void client
      .request<{ sessions?: unknown[] }>("chat.sessions.list", {})
      .then((r) => setSessionsCount(r?.sessions?.length ?? 0))
      .catch(() => setSessionsCount(null));

    void client
      .request<{ enabled?: boolean }>("cron.status", {})
      .then((r) => setCronEnabled(r?.enabled ?? null))
      .catch(() => setCronEnabled(null));
  }, [isConnected]);

  const formatUptime = (ms?: number) => {
    if (!ms) {
      return "N/A";
    }
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) {
      return `${d}d ${h % 24}h`;
    }
    if (h > 0) {
      return `${h}h ${m % 60}m`;
    }
    return `${m}m`;
  };

  const isPairingRequired = !isConnected && lastErrorCode?.includes("PAIRING");
  const isAuthRequired = !isConnected && lastErrorCode?.includes("AUTH");

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">Gateway status and system information.</p>
      </div>

      {updateAvailable && (
        <Card className="border-blue-500/50 bg-blue-500/5">
          <CardContent className="pt-6">
            <p className="font-medium">Update Available: {updateAvailable.version}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ServerIcon className="size-5" />
            Connection Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "size-3 rounded-full",
                  isConnected
                    ? "bg-emerald-500"
                    : isConnecting
                      ? "bg-amber-500 animate-pulse"
                      : "bg-muted-foreground/50",
                )}
              />
              <div>
                <p className="font-medium">
                  {isConnected ? "Connected" : isConnecting ? "Connecting..." : "Disconnected"}
                </p>
                {isConnected && serverVersion && (
                  <p className="text-sm text-muted-foreground">v{serverVersion}</p>
                )}
              </div>
            </div>
            {!isConnected && (
              <Button onClick={() => window.location.reload()} disabled={isConnecting}>
                Connect
              </Button>
            )}
          </div>

          {lastError && !isConnected && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">{lastError}</p>
            </div>
          )}

          {isPairingRequired && (
            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
              <p className="text-sm font-medium">Device Pairing Required</p>
              <code className="block bg-background px-3 py-2 rounded text-xs">
                openclaw devices list
              </code>
              <code className="block bg-background px-3 py-2 rounded text-xs">
                openclaw devices approve &lt;requestId&gt;
              </code>
            </div>
          )}

          {isAuthRequired && (
            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
              <p className="text-sm font-medium">Authentication Required</p>
              <code className="block bg-background px-3 py-2 rounded text-xs">
                openclaw dashboard --no-open
              </code>
            </div>
          )}

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">Gateway URL</p>
            <p className="text-sm font-mono mt-1">{settings.gatewayUrl}</p>
          </div>
        </CardContent>
      </Card>

      {isConnected && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Uptime</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{formatUptime(snapshot?.uptimeMs)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <UsersIcon className="size-4" />
                Devices
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{presenceEntries.length}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <MessageSquareIcon className="size-4" />
                Sessions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{sessionsCount ?? "—"}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ClockIcon className="size-4" />
                Cron
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={cronEnabled ? "default" : "secondary"}>
                {cronEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </CardContent>
          </Card>
        </div>
      )}

      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle>System Information</CardTitle>
            <CardDescription>Gateway configuration and runtime details.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Protocol</p>
                <p className="text-sm font-mono">{hello?.protocol ?? "N/A"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Tick Interval</p>
                <p className="text-sm font-mono">
                  {snapshot?.policy?.tickIntervalMs ? `${snapshot.policy.tickIntervalMs}ms` : "N/A"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Connection ID</p>
                <p className="text-sm font-mono truncate">{hello?.server?.connId ?? "N/A"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
