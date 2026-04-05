import { useEffect } from "react";
import { ClockIcon, Loader2Icon, RefreshCwIcon, CheckCircleIcon, XCircleIcon, MinusCircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAgentsStore } from "@/store/agents.store";
import { useGatewayStore } from "@/store/gateway.store";
import type { CronJob } from "@/types/agents";
import { formatDistanceToNow } from "@/lib/relative-time";

function relativeTime(ms?: number | null): string {
  if (!ms) {
    return "—";
  }
  return formatDistanceToNow(new Date(ms));
}

function formatSchedule(job: CronJob): string {
  const s = job.schedule;
  if (s.kind === "every") {
    const ms = s.everyMs;
    if (ms % 3600000 === 0) {return `Every ${ms / 3600000}h`};
    if (ms % 60000 === 0) {return `Every ${ms / 60000}m`};
    return `Every ${ms}ms`;
  }
  if (s.kind === "cron") {return `Cron: ${s.expr}`};
  if (s.kind === "at") {return `At: ${s.at}`};
  return "Unknown";
}

function StatusIcon({ status }: { status?: "ok" | "error" | "skipped" | null }) {
  if (status === "ok") {return <CheckCircleIcon className="size-4 text-emerald-500" />};
  if (status === "error") {return <XCircleIcon className="size-4 text-destructive" />};
  if (status === "skipped") {return <MinusCircleIcon className="size-4 text-muted-foreground" />};
  return <ClockIcon className="size-4 text-muted-foreground" />;
}

function CronJobCard({ job }: { job: CronJob }) {
  const state = job.state;
  return (
    <Card className={cn(!job.enabled && "opacity-60")}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start gap-3">
          <StatusIcon status={state?.lastStatus} />
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium truncate">{job.name}</p>
              <Badge variant={job.enabled ? "default" : "secondary"} className="text-xs shrink-0">
                {job.enabled ? "enabled" : "disabled"}
              </Badge>
              {job.deleteAfterRun && (
                <Badge variant="outline" className="text-xs shrink-0">one-shot</Badge>
              )}
            </div>
            {job.description && (
              <p className="text-xs text-muted-foreground">{job.description}</p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
              <span className="text-xs text-muted-foreground">
                <span className="font-medium">Schedule:</span> {formatSchedule(job)}
              </span>
              {state?.nextRunAtMs && (
                <span className="text-xs text-muted-foreground">
                  <span className="font-medium">Next:</span> {relativeTime(state.nextRunAtMs)}
                </span>
              )}
              {state?.lastRunAtMs && (
                <span className="text-xs text-muted-foreground">
                  <span className="font-medium">Last run:</span> {relativeTime(state.lastRunAtMs)}
                </span>
              )}
              {state?.lastDurationMs != null && (
                <span className="text-xs text-muted-foreground">
                  <span className="font-medium">Duration:</span> {state.lastDurationMs}ms
                </span>
              )}
            </div>
            {state?.lastError && (
              <p className="text-xs text-destructive mt-1">{state.lastError}</p>
            )}
            <div className="flex flex-wrap gap-x-4 mt-1">
              <span className="text-xs text-muted-foreground">
                <span className="font-medium">Target:</span> {job.sessionTarget}
              </span>
              {job.agentId && (
                <span className="text-xs text-muted-foreground">
                  <span className="font-medium">Agent:</span> {job.agentId}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function CronPage() {
  const isConnected = useGatewayStore((s) => s.status === "connected");
  const cronLoading = useAgentsStore((s) => s.cronLoading);
  const cronError   = useAgentsStore((s) => s.cronError);
  const cronStatus  = useAgentsStore((s) => s.cronStatus);
  const cronJobs    = useAgentsStore((s) => s.cronJobs);
  const loadCronStatus = useAgentsStore((s) => s.loadCronStatus);

  useEffect(() => {
    if (isConnected && !cronStatus) {void loadCronStatus();};
  }, [isConnected, cronStatus, loadCronStatus]);

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Not connected to gateway.
      </div>
    );
  }

  if (cronLoading && !cronStatus) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        <span className="text-sm">Loading cron…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cron</h1>
          <p className="text-sm text-muted-foreground">Scheduled jobs and automation.</p>
        </div>
        <Button size="sm" variant="outline" disabled={cronLoading} onClick={() => void loadCronStatus()}>
          <RefreshCwIcon className={cn("size-3.5 mr-1.5", cronLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {cronError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {cronError}
        </div>
      )}

      {cronStatus && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Status</CardTitle></CardHeader>
            <CardContent>
              <Badge variant={cronStatus.enabled ? "default" : "secondary"}>
                {cronStatus.enabled ? "Enabled" : "Disabled"}
              </Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Jobs</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-semibold">{cronStatus.jobs}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Next Wake</CardTitle></CardHeader>
            <CardContent><p className="text-sm">{relativeTime(cronStatus.nextWakeAtMs)}</p></CardContent>
          </Card>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Jobs</h2>
          <Badge variant="secondary">{cronJobs.length}</Badge>
        </div>
        {cronJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cron jobs configured.</p>
        ) : (
          <div className="space-y-3">
            {cronJobs.map((job) => <CronJobCard key={job.id} job={job} />)}
          </div>
        )}
      </div>
    </div>
  );
}
