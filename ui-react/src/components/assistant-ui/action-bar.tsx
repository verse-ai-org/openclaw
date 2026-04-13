import { ActionBarPrimitive } from "@assistant-ui/react";
import { CheckIcon, CopyIcon, RefreshCwIcon } from "lucide-react";

export function ActionBar({ hideWhenRunning, autohide, autohideFloat }: { hideWhenRunning?: boolean, autohide?: "always" | "never" | 'not-last', autohideFloat?: "always" | "never" | "single-branch"}) {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning={hideWhenRunning ?? false}
      autohide={autohide ?? "not-last"}
      autohideFloat={autohideFloat ?? "single-branch"}
      className="flex gap-0.5 data-floating:opacity-0 data-floating:group-hover:opacity-100 data-floating:transition-opacity"
    >
      <ActionBarPrimitive.Copy className="group/copy flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
        <CopyIcon className="size-4 group-data-copied/copy:hidden" />
        <CheckIcon className="hidden size-4 group-data-copied/copy:block" />
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
        <RefreshCwIcon className="size-4" />
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
}
