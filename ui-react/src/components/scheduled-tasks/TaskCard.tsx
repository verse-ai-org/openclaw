import { ClockIcon, MoreVerticalIcon } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CronJob } from "@/types/agents";
import { formatJobSchedule } from "@/lib/cron-format";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface TaskCardProps {
  job: CronJob;
  onEdit: (job: CronJob) => void;
  onDelete: (jobId: string) => void;
  onToggleEnabled: (jobId: string, enabled: boolean) => void;
  onRunNow: (jobId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function TaskCard({ job, onEdit, onDelete, onToggleEnabled, onRunNow }: TaskCardProps) {
  const isEnabled = job.enabled;

  function handleToggle(checked: boolean) {
    onToggleEnabled(job.id, checked);
    toast(checked ? "Task enabled" : "Task disabled", {
      duration: 2000,
    });
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onEdit(job)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { onEdit(job); } }}
      className={
        "relative flex flex-col gap-3 rounded-xl border bg-card p-5 transition-opacity cursor-pointer hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" +
        (!isEnabled ? " opacity-60" : "")
      }
    >
      {/* Top-right controls: Toggle + Dropdown — stop propagation so clicks here don't open edit */}
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
            <DropdownMenuItem onClick={() => { onRunNow(job.id); toast("Task started", { duration: 2000 }); }}>Run now</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(job.id)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Task name */}
      <h3 className="pr-20 text-sm font-semibold leading-snug">{job.name}</h3>

      {/* Description / prompt summary */}
      {job.description && (
        <p className="line-clamp-3 text-sm text-muted-foreground">{job.description}</p>
      )}

      {/* Schedule label */}
      <div className="mt-auto flex items-center gap-1.5 text-xs text-muted-foreground">
        <ClockIcon className="size-3.5 shrink-0" />
        <span className="text-xs">{formatJobSchedule(job)}</span>
      </div>

      {/* Last run status indicator */}
      {job.state?.lastStatus && (
        <div className="flex items-center gap-1.5">
          <span
            className={
              "inline-block size-2 rounded-full" +
              (job.state.lastStatus === "ok"
                ? " bg-green-500"
                : job.state.lastStatus === "error"
                  ? " bg-red-500"
                  : " bg-yellow-500")
            }
          />
          <span className="text-xs text-muted-foreground capitalize">
            Last run: {job.state.lastStatus}
          </span>
        </div>
      )}
    </div>
  );
}
