import { CheckIcon, LoaderIcon, XCircleIcon } from "lucide-react";
import type { ToolStatus } from "./types";

interface StatusBadgeProps {
  status: ToolStatus;
  isCancelled: boolean;
}

export function StatusBadge({ status, isCancelled }: StatusBadgeProps) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        <LoaderIcon className="size-3 animate-spin" />
        Running
      </span>
    );
  }
  if (status === "incomplete") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
        <XCircleIcon className="size-3" />
        {isCancelled ? "Cancelled" : "Failed"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
      <CheckIcon className="size-3" />
      Done
    </span>
  );
}
