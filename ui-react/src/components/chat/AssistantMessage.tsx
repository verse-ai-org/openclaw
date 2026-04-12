import { MessagePrimitive, ActionBarPrimitive, AuiIf } from "@assistant-ui/react";
import { type FC } from "react";
import { CheckIcon, CopyIcon, RefreshCwIcon } from "lucide-react";
import { MarkdownText } from "../assistant-ui/markdown-text.tsx";
import { ToolFallback } from "./ToolFallback";
import { ToolCallGroup } from "./ToolCallGroup";


// ---------------------------------------------------------------------------
// AssistantMessage
// ---------------------------------------------------------------------------
export const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="relative mx-auto w-full max-w-3xl data-[role=assistant]:animate-in data-[role=assistant]:fade-in data-[role=assistant]:slide-in-from-bottom-1"
      data-role="assistant"
    >
      {/* Content */}
      <div className="wrap-break-word px-2 text-foreground leading-relaxed">
        {/* Loading dots shown while this message is in-progress (no content yet) */}
        <AuiIf
          condition={(s) => s.message.status?.type === "running" && s.message.content.length === 0}
        >
          <span className="inline-flex items-center gap-1 py-1">
            <span className="size-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:0ms]" />
            <span className="size-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:150ms]" />
            <span className="size-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:300ms]" />
          </span>
        </AuiIf>

        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            tools: { Fallback: ToolFallback },
            ToolGroup: ToolCallGroup,
          }}
        />
      </div>

      {/* Footer: action bar */}
      <ActionBarPrimitive.Root
        hideWhenRunning
        // autohide="always"
        autohideFloat="always"
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
    </MessagePrimitive.Root>
  );
};
