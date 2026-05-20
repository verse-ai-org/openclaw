import { cn } from "@/lib/utils";
import {
  CHANNEL_LIFECYCLE_LABELS,
  type ChannelLifecycle,
} from "@/lib/channel-lifecycle";

const LIFECYCLE_STYLES: Record<ChannelLifecycle, string> = {
  not_loaded: "bg-muted text-muted-foreground",
  plugin_disabled: "bg-muted text-muted-foreground",
  channel_disabled: "bg-muted text-muted-foreground",
  needs_setup: "bg-amber-500/15 text-amber-900 dark:text-amber-200",
  configured: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  running: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  error: "bg-destructive/15 text-destructive",
};

export function ChannelLifecycleBadge({
  lifecycle,
  className,
}: {
  lifecycle: ChannelLifecycle;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        LIFECYCLE_STYLES[lifecycle],
        className,
      )}
    >
      {CHANNEL_LIFECYCLE_LABELS[lifecycle]}
    </span>
  );
}
