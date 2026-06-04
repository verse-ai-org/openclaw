import { type FC } from "react";
import { cn } from "@/lib/utils";
import { AssistantLoadingIndicator } from "@/components/assistant-ui/assistant-loading-indicator";

export type ThreadRunningIndicatorProps = {
  visible: boolean;
};

/** Sticky-footer “session running” pill; pairs with ContextNotice on long threads. */
export const ThreadRunningIndicator: FC<ThreadRunningIndicatorProps> = ({ visible }) => {
  if (!visible) {
    return null;
  }

  return (
    <div
      className={cn(
        "inline-flex items-center px-2 py-1.5 backdrop-blur-md",
        "rounded-full border border-border/70 bg-muted/30 text-muted-foreground",
        "text-[13px] leading-tight select-none animate-in fade-in duration-200",
      )}
      role="status"
      aria-live="polite"
      title="Assistant is generating a response"
      aria-label="Assistant is generating a response"
    >
      <AssistantLoadingIndicator />
    </div>
  );
};
