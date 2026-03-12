import {
  MessagePrimitive,
  ActionBarPrimitive,
  BranchPickerPrimitive,
  AuiIf,
  type TextMessagePartComponent,
} from "@assistant-ui/react";
import {
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
  useIsMarkdownCodeBlock,
} from "@assistant-ui/react-markdown";
import { CopyIcon, CheckIcon, RefreshCwIcon } from "lucide-react";
import { type FC, memo } from "react";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/utils";
import { ToolFallback } from "./ToolFallback";

// ---------------------------------------------------------------------------
// Markdown components — give each element explicit Tailwind classes
// ---------------------------------------------------------------------------
const mdComponents = memoizeMarkdownComponents({
  h1: ({ className, ...props }) => (
    <h1
      className={cn(
        "scroll-m-20 text-4xl font-extrabold tracking-tight text-balance mt-6 mb-2 first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      className={cn(
        "scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight mt-6 mb-2 first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      className={cn(
        "scroll-m-20 text-2xl font-semibold tracking-tight mt-5 mb-1.5 first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  h4: ({ className, ...props }) => (
    <h4
      className={cn(
        "scroll-m-20 text-xl font-semibold tracking-tight mt-4 mb-1 first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  h5: ({ className, ...props }) => (
    <h5
      className={cn("text-lg font-semibold tracking-tight mt-3 mb-1 first:mt-0", className)}
      {...props}
    />
  ),
  h6: ({ className, ...props }) => (
    <h6
      className={cn("text-base font-semibold tracking-tight mt-3 mb-1 first:mt-0", className)}
      {...props}
    />
  ),
  p: ({ className, ...props }) => (
    <p className={cn("leading-7 not-first:mt-4", className)} {...props} />
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn("text-primary underline underline-offset-4 hover:text-primary/80", className)}
      {...props}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote className={cn("mt-6 border-l-2 pl-6 italic", className)} {...props} />
  ),
  ul: ({ className, ...props }) => (
    <ul className={cn("my-6 ml-6 list-disc [&>li]:mt-2", className)} {...props} />
  ),
  ol: ({ className, ...props }) => (
    <ol className={cn("my-6 ml-6 list-decimal [&>li]:mt-2", className)} {...props} />
  ),
  li: ({ className, ...props }) => <li className={cn("leading-7", className)} {...props} />,
  hr: ({ className, ...props }) => (
    <hr className={cn("my-4 border-border", className)} {...props} />
  ),
  table: ({ className, ...props }) => (
    <div className="my-6 w-full overflow-y-auto">
      <table className={cn("w-full", className)} {...props} />
    </div>
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        "border px-4 py-2 text-left font-bold [[align=center]]:text-center [[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn(
        "border px-4 py-2 text-left [[align=center]]:text-center [[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  tr: ({ className, ...props }) => (
    <tr className={cn("m-0 border-t p-0 even:bg-muted", className)} {...props} />
  ),
  sup: ({ className, ...props }) => (
    <sup className={cn("[&>a]:text-xs [&>a]:no-underline", className)} {...props} />
  ),
  pre: ({ className, ...props }) => (
    <pre
      className={cn(
        "my-4 overflow-x-auto rounded-lg border bg-muted/50 p-4 text-sm leading-relaxed",
        className,
      )}
      {...props}
    />
  ),
  code: function Code({ className, ...props }) {
    const isCodeBlock = useIsMarkdownCodeBlock();
    return (
      <code
        className={cn(
          !isCodeBlock &&
            "relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold",
          className,
        )}
        {...props}
      />
    );
  },
});

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
      className="relative mx-auto w-full max-w-3xl py-3 data-[role=assistant]:animate-in data-[role=assistant]:fade-in data-[role=assistant]:slide-in-from-bottom-1"
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
      <div className="mt-1 ml-2 flex min-h-6 items-center gap-1">
        <AssistantBranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

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
      <button type="button" className="rounded p-1 hover:bg-muted" aria-label="Copy message">
        <AuiIf condition={(s) => s.message.isCopied}>
          <CheckIcon className="size-3.5" />
        </AuiIf>
        <AuiIf condition={(s) => !s.message.isCopied}>
          <CopyIcon className="size-3.5" />
        </AuiIf>
      </button>
    </ActionBarPrimitive.Copy>
    <ActionBarPrimitive.Reload asChild>
      <button type="button" className="rounded p-1 hover:bg-muted" aria-label="Regenerate response">
        <RefreshCwIcon className="size-3.5" />
      </button>
    </ActionBarPrimitive.Reload>
  </ActionBarPrimitive.Root>
);
