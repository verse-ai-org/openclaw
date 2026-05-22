import { CheckCircle2Icon, LoaderIcon, MinusCircleIcon, XCircleIcon } from "lucide-react";
import type { CronRunRecord } from "@/types/agents";

interface RunHistoryStatusBadgeProps {
  status: CronRunRecord["status"];
  runStatus?: CronRunRecord["runStatus"];
}

export function RunHistoryStatusBadge({ status, runStatus }: RunHistoryStatusBadgeProps) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
        <LoaderIcon className="size-3 animate-spin" />
        Running
      </span>
    );
  }

  if (status === "success" || runStatus === "ok") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
        <CheckCircle2Icon className="size-3" />
        Success
      </span>
    );
  }

  if (runStatus === "skipped") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        <MinusCircleIcon className="size-3" />
        Skipped
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
      <XCircleIcon className="size-3" />
      Failed
    </span>
  );
}
