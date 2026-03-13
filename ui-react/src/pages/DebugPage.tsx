import { RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway.store";

export function DebugPage() {
  const status = useGatewayStore((s) => s.status);
  const hello = useGatewayStore((s) => s.hello);
  const debugHealth = useGatewayStore((s) => s.debugHealth);
  const eventLogBuffer = useGatewayStore((s) => s.eventLogBuffer);
  const serverVersion = useGatewayStore((s) => s.serverVersion);

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    // Trigger a reconnect to refresh data
    const client = useGatewayStore.getState().client;
    if (client?.connected) {
      try {
        // Request fresh health data
        await client.request("health", {});
      } catch (err) {
        console.error("[debug] refresh failed:", err);
      }
    }
    setTimeout(() => setRefreshing(false), 500);
  };

  const isConnected = status === "connected";

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Debug</h1>
          <p className="text-sm text-muted-foreground">
            Gateway snapshots, health status, and event log.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing || !isConnected}
        >
          <RefreshCwIcon className={cn("size-4 mr-2", refreshing && "animate-spin")} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {/* Connection status */}
      {!isConnected && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Not connected to gateway. Connect to view debug information.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="connection" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="connection">Connection</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
        </TabsList>

        {/* Connection Info */}
        <TabsContent value="connection" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Connection Information</CardTitle>
              <CardDescription>Gateway hello response and server metadata.</CardDescription>
            </CardHeader>
            <CardContent>
              {hello ? (
                <div className="space-y-4">
                  {/* Quick info */}
                  <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Server Version</div>
                      <div className="font-mono text-sm">{serverVersion || "Unknown"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Protocol</div>
                      <div className="font-mono text-sm">{hello.protocol}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Connection ID</div>
                      <div className="font-mono text-sm truncate">
                        {hello.server?.connId || "N/A"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Status</div>
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-emerald-500" />
                        <span className="text-sm font-medium">Connected</span>
                      </div>
                    </div>
                  </div>

                  {/* Full JSON */}
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                      Full Response
                    </div>
                    <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto max-h-96 font-mono">
                      {JSON.stringify(hello, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No connection data available.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Health Status */}
        <TabsContent value="health" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Health Status</CardTitle>
              <CardDescription>System health snapshot from the gateway.</CardDescription>
            </CardHeader>
            <CardContent>
              {debugHealth ? (
                <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto max-h-[600px] font-mono">
                  {JSON.stringify(debugHealth, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No health data available. Health snapshots are sent periodically by the gateway.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Event Log */}
        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Event Log</CardTitle>
              <CardDescription>
                Recent gateway events (last {eventLogBuffer.length} of 250 max).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {eventLogBuffer.length > 0 ? (
                <div className="space-y-1 max-h-[600px] overflow-auto">
                  {eventLogBuffer.map((entry, index) => (
                    <EventLogEntry key={index} entry={entry} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No events logged yet. Events will appear here as they occur.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Event log entry component
interface EventLogEntryProps {
  entry: {
    ts: number;
    event: string;
    payload: unknown;
  };
}

function EventLogEntry({ entry }: EventLogEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const timestamp = new Date(entry.ts).toLocaleTimeString();
  const hasPayload = entry.payload != null;

  // Determine event type for styling
  const eventType = entry.event.split(".")[0];
  const eventColor =
    {
      chat: "text-blue-600 dark:text-blue-400",
      tool: "text-purple-600 dark:text-purple-400",
      agent: "text-green-600 dark:text-green-400",
      presence: "text-amber-600 dark:text-amber-400",
      health: "text-teal-600 dark:text-teal-400",
      update: "text-orange-600 dark:text-orange-400",
    }[eventType] || "text-muted-foreground";

  return (
    <div className="border-l-2 border-muted pl-3 py-1.5 hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-2">
        <span className="text-xs text-muted-foreground font-mono shrink-0 w-20">{timestamp}</span>
        <span className={cn("text-xs font-semibold font-mono shrink-0", eventColor)}>
          {entry.event}
        </span>
        {hasPayload && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted-foreground hover:text-foreground ml-auto"
          >
            {expanded ? "Hide" : "Show"} payload
          </button>
        )}
      </div>
      {expanded && hasPayload && (
        <pre className="mt-2 bg-muted/50 p-2 rounded text-xs overflow-auto max-h-40 font-mono">
          {JSON.stringify(entry.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}
