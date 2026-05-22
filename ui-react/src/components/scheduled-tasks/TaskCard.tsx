import { useState } from "react";
import { ClockIcon, MoreVerticalIcon } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CronJob } from "@/types/agents";
import { formatJobSchedule } from "@/lib/cron-format";
import { getCronJobAgentPrompt } from "@/lib/cron-job-text";
import { relativeTime } from "@/lib/relative-time";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface TaskCardProps {
  job: CronJob;
  onEdit: (job: CronJob) => void;
  onDelete: (jobId: string) => void;
  onToggleEnabled: (jobId: string, enabled: boolean) => void;
  onRunNow: (jobId: string, jobName?: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function TaskCard({ job, onEdit, onDelete, onToggleEnabled, onRunNow }: TaskCardProps) {
  const isEnabled = job.enabled;
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const agentPrompt = getCronJobAgentPrompt(job) || null;
  const state = job.state;
  const showNextRun = isEnabled && state?.nextRunAtMs != null;
  const showLastRun = state?.lastRunAtMs != null;

  function handleToggle(checked: boolean) {
    onToggleEnabled(job.id, checked);
    toast(checked ? "Task enabled" : "Task disabled", {
      duration: 2000,
    });
  }

  function handleConfirmDelete() {
    setDeleteConfirmOpen(false);
    onDelete(job.id);
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onEdit(job)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { onEdit(job); } }}
        className={
          "relative flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-opacity cursor-pointer hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" +
          (!isEnabled ? " opacity-60" : "")
        }
      >
        <div
          className="absolute right-4 top-4 flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            aria-label={isEnabled ? "Disable task" : "Enable task"}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground">
                <MoreVerticalIcon className="size-4" />
                <span className="sr-only">Task options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onRunNow(job.id, job.name)}>
                Run now
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <h3 className="pr-20 text-sm font-semibold leading-snug">{job.name}</h3>

        {agentPrompt && (
          <p className="line-clamp-2 text-sm text-muted-foreground" title={agentPrompt}>
            {agentPrompt}
          </p>
        )}
        {!agentPrompt && job.description && (
          <p className="line-clamp-3 text-sm text-muted-foreground">{job.description}</p>
        )}

        <div className="mt-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <ClockIcon className="size-3.5 shrink-0" />
          <span>{formatJobSchedule(job)}</span>
        </div>

        {(showNextRun || showLastRun) && (
          <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {showNextRun && (
              <span>
                <span className="font-medium text-foreground/80">Next:</span>{" "}
                {relativeTime(state.nextRunAtMs)}
              </span>
            )}
            {showLastRun && (
              <span>
                <span className="font-medium text-foreground/80">Last run:</span>{" "}
                {relativeTime(state.lastRunAtMs)}
                {state.lastDurationMs != null && (
                  <span className="text-muted-foreground/80">
                    {" "}
                    ({state.lastDurationMs < 1000
                      ? `${state.lastDurationMs}ms`
                      : `${(state.lastDurationMs / 1000).toFixed(1)}s`})
                  </span>
                )}
              </span>
            )}
          </div>
        )}

        {state?.lastStatus && (
          <div className="flex items-center gap-1.5">
            <span
              className={
                "inline-block size-2 shrink-0 rounded-full" +
                (state.lastStatus === "ok"
                  ? " bg-emerald-500 dark:bg-emerald-400"
                  : state.lastStatus === "error"
                    ? " bg-destructive"
                    : " bg-amber-500 dark:bg-amber-400")
              }
            />
            <span className="text-xs text-muted-foreground capitalize">
              {state.lastStatus === "ok" ? "Last succeeded" : state.lastStatus === "error" ? "Last failed" : `Last: ${state.lastStatus}`}
            </span>
          </div>
        )}

        {state?.lastStatus === "error" && state.lastError && (
          <p className="line-clamp-2 text-xs text-destructive" title={state.lastError}>
            {state.lastError}
          </p>
        )}
      </div>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete scheduled task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{job.name}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-destructive text-white"
              onClick={handleConfirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
