import { MessagePrimitive, AuiIf, type TextMessagePartComponent } from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { type FC, memo } from "react";
import remarkGfm from "remark-gfm";
import { mdComponents } from "./markdown-components";
import { ToolFallback } from "./ToolFallback";

// ---------------------------------------------------------------------------
// MarkdownText component
// ---------------------------------------------------------------------------
const MarkdownTextImpl: FC = () => (
  <MarkdownTextPrimitive remarkPlugins={[remarkGfm]} components={mdComponents} />
);

const MarkdownText = memo(MarkdownTextImpl) as unknown as TextMessagePartComponent;

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
          }}
        />
      </div>

      {/* Footer: branch picker + action bar */}
      {/* Commented out until needed
      <div className="mt-1 ml-2 flex min-h-6 items-center gap-1">
        <AssistantBranchPicker />
        <AssistantActionBar />
      </div>
      */}
    </MessagePrimitive.Root>
  );
};

/*
// Commented out until needed
const AssistantBranchPicker: FC = () => (
  <BranchPickerPrimitive.Root
    hideWhenSingleBranch
    className="flex items-center gap-0.5 text-xs text-muted-foreground"
  >
    <BranchPickerPrimitive.Previous asChild>
      <button
        type="button"
        className="rounded p-0.5 hover:bg-muted disabled:opacity-40"
        aria-label="Previous branch"
      >
        ‹
      </button>
    </BranchPickerPrimitive.Previous>
    <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
    <BranchPickerPrimitive.Next asChild>
      <button
        type="button"
        className="rounded p-0.5 hover:bg-muted disabled:opacity-40"
        aria-label="Next branch"
      >
        ›
      </button>
    </BranchPickerPrimitive.Next>
  </BranchPickerPrimitive.Root>
);

const AssistantActionBar: FC = () => (
  <ActionBarPrimitive.Root
    hideWhenRunning
    autohide="not-last"
    className="flex gap-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/message:opacity-100"
  >
    <ActionBarPrimitive.Copy asChild>
      <button
        type="button"
        className="rounded p-1 hover:bg-muted"
        aria-label="Copy message"
      >
        <AuiIf condition={(s) => s.message.isCopied}>
          <CheckIcon className="size-3.5" />
        </AuiIf>
        <AuiIf condition={(s) => !s.message.isCopied}>
          <CopyIcon className="size-3.5" />
        </AuiIf>
      </button>
    </ActionBarPrimitive.Copy>
    <ActionBarPrimitive.Reload asChild>
      <button
        type="button"
        className="rounded p-1 hover:bg-muted"
        aria-label="Regenerate response"
      >
        <RefreshCwIcon className="size-3.5" />
      </button>
    </ActionBarPrimitive.Reload>
  </ActionBarPrimitive.Root>
);
*/
