import { FC, memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import {
  type CodeHeaderProps,
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
  useIsMarkdownCodeBlock,
} from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Shared Markdown component definitions — shadcn typography styles.
 *
 * Two exports:
 * - `mdComponents`      — for use with MarkdownTextPrimitive (assistant-ui context required)
 * - `plainMdComponents` — for use with plain ReactMarkdown (no assistant-ui context needed,
 *                         e.g. inside Drawer or other standalone surfaces)
 */
import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";
import { useCopyToClipboard } from "@/hooks/common/use-copy-to-clipboard.ts";
import { TooltipIconButton } from "./tooltip-icon-button.tsx";
import { CheckIcon, CopyIcon } from "lucide-react";

const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const onCopy = () => {
    if (!code || isCopied) { return; }
    copyToClipboard(code);
  };
  return (
    <div className="aui-code-header-root mb-2 flex items-center justify-between p-0 text-xs">
      <span className="aui-code-header-language font-medium text-muted-foreground lowercase">
        {language}
      </span>
      <TooltipIconButton tooltip="Copy" onClick={onCopy}>
        {!isCopied && <CopyIcon />}
        {isCopied && <CheckIcon />}
      </TooltipIconButton>
    </div>
  );
};

// ---------------------------------------------------------------------------
// mdComponents — for MarkdownTextPrimitive (assistant-ui context required)
// code component uses useIsMarkdownCodeBlock() hook.
// ---------------------------------------------------------------------------
/** shadcn Typography — inline code (https://ui.shadcn.com/docs/components/typography) */
const inlineCodeClass =
  "relative rounded-md border border-border/60 bg-muted px-[0.3rem] py-[0.15rem] font-mono text-[0.875em] font-semibold text-foreground";

function CodeWithContext({ className, ...props }: React.ComponentPropsWithoutRef<"code">) {
  const isCodeBlock = useIsMarkdownCodeBlock();
  return (
    <code
      className={cn(!isCodeBlock && inlineCodeClass, className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Shared element styles (no hook usage) — aligned with shadcn Typography docs
// ---------------------------------------------------------------------------
const sharedElements: Components = {
  h1: ({ className, ...props }) => (
    <h1
      className={cn(
        "scroll-m-20 text-balance text-4xl font-extrabold tracking-tight text-foreground",
        "mt-8 mb-4 first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      className={cn(
        "scroll-m-20 border-b border-border pb-2 text-3xl font-semibold tracking-tight text-foreground",
        "mt-10 mb-4 transition-colors first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      className={cn(
        "scroll-m-20 text-2xl font-semibold tracking-tight text-foreground",
        "mt-8 mb-3 first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  h4: ({ className, ...props }) => (
    <h4
      className={cn(
        "scroll-m-20 text-xl font-semibold tracking-tight text-foreground",
        "mt-6 mb-2 first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  h5: ({ className, ...props }) => (
    <h5
      className={cn(
        "text-lg font-semibold tracking-tight text-foreground",
        "mt-6 mb-2 first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  h6: ({ className, ...props }) => (
    <h6
      className={cn(
        "text-base font-semibold tracking-tight text-muted-foreground",
        "mt-6 mb-2 first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  p: ({ className, ...props }) => (
    <p
      className={cn(
        "leading-7 text-foreground [&:not(:first-child)]:mt-6",
        className,
      )}
      {...props}
    />
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn(
        "font-medium text-primary underline underline-offset-4 transition-colors hover:text-primary/90",
        className,
      )}
      {...props}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn(
        "mt-6 border-l-2 border-border pl-6 italic text-muted-foreground",
        "[&_p]:mt-0 [&_p]:leading-7 [&_p+p]:mt-4",
        className,
      )}
      {...props}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn(
        "my-6 ml-6 list-disc text-foreground marker:text-muted-foreground",
        "[&>li]:mt-2 [&_ul]:my-2 [&_ol]:my-2 [&_ul]:ml-4 [&_ol]:ml-4",
        className,
      )}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn(
        "my-6 ml-6 list-decimal text-foreground marker:text-muted-foreground",
        "[&>li]:mt-2 [&_ul]:my-2 [&_ol]:my-2 [&_ul]:ml-4 [&_ol]:ml-4",
        className,
      )}
      {...props}
    />
  ),
  li: ({ className, ...props }) => (
    <li className={cn("leading-7 [&>p]:my-2 [&>p]:leading-7", className)} {...props} />
  ),
  hr: ({ className, ...props }) => (
    <hr className={cn("my-8 border-border", className)} {...props} />
  ),
  strong: ({ className, ...props }) => (
    <strong className={cn("font-semibold text-foreground", className)} {...props} />
  ),
  em: ({ className, ...props }) => (
    <em className={cn("italic", className)} {...props} />
  ),
  del: ({ className, ...props }) => (
    <del className={cn("line-through text-muted-foreground", className)} {...props} />
  ),
  img: ({ className, alt, ...props }) => (
    <img
      className={cn("my-6 max-h-[min(70vh,560px)] w-auto max-w-full rounded-md border border-border object-contain", className)}
      alt={alt ?? ""}
      {...props}
    />
  ),
  // Match shadcn/ui Table: bordered shell, row dividers, muted header, body row hover.
  table: ({ className, ...props }) => (
    <div className="relative my-6 w-full overflow-x-auto rounded-md border border-border">
      <table
        className={cn("w-full caption-bottom border-collapse text-sm", className)}
        {...props}
      />
    </div>
  ),
  thead: ({ className, ...props }) => (
    <thead className={cn("[&_tr]:border-b [&_tr]:border-border [&_tr]:bg-muted/50", className)} {...props} />
  ),
  tbody: ({ className, ...props }) => (
    <tbody className={cn("[&_tr:last-child]:border-0 [&_tr:hover]:bg-muted/50", className)} {...props} />
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        "h-10 px-3 text-left align-middle font-medium text-muted-foreground [&[align=center]]:text-center [&[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn(
        "p-3 align-middle text-foreground [&[align=center]]:text-center [&[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  tr: ({ className, ...props }) => (
    <tr className={cn("border-b border-border transition-colors", className)} {...props} />
  ),
  sup: ({ className, ...props }) => (
    <sup
      className={cn("[&>a]:text-xs [&>a]:no-underline", className)}
      {...props}
    />
  ),
  pre: ({ className, ...props }) => (
    <pre
      className={cn(
        "aui-md-pre my-6 overflow-x-auto rounded-lg border border-border bg-muted/50 p-4 text-sm leading-relaxed",
        className,
      )}
      {...props}
    />
  ),
};

// ---------------------------------------------------------------------------
// markdown shared common components 
// ---------------------------------------------------------------------------
export const mdComponents = memoizeMarkdownComponents({
  ...(sharedElements as Parameters<typeof memoizeMarkdownComponents>[0]),
  code: CodeWithContext,
  CodeHeader,
});

// ---------------------------------------------------------------------------
// plainMdComponents — for plain ReactMarkdown (no assistant-ui context)
// code component uses className heuristic instead of the hook.
// ---------------------------------------------------------------------------
export const plainMdComponents: Components = {
  ...sharedElements,
  code: ({ className, ...props }: React.ComponentPropsWithoutRef<"code">) => {
    const isBlock = Boolean(className?.startsWith("language-"));
    return (
      <>
        {isBlock && (
          <CodeHeader language={className?.replace("language-", "")} code={props.children as string} />
        )}
        <code className={cn(!isBlock && inlineCodeClass, className)} {...props} />
      </>
    );
  },
};

export const AssistantMarkdown: FC<{ text: string }> = ({ text }) => {
  return (
    <div className="aui-md max-w-none text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={plainMdComponents}>
        {text}
      </ReactMarkdown>
    </div>
  );
};

export const AssistantMarkdownPart = memo(AssistantMarkdown);

/** Renders all assistant text markdown parts, then a single copy control for the combined Markdown (same join as `splitAssistantContentParts` `textContent`). */
export const AssistantMarkdownTextBlock: FC<{
  textParts: ReadonlyArray<{ text: string }>;
}> = ({ textParts }) => {
  const fullMarkdown = useMemo(
    () => textParts.map((p) => p.text).join("\n\n").trim(),
    [textParts],
  );
  const { isCopied, copyToClipboard } = useCopyToClipboard();

  if (textParts.length === 0) {
    return null;
  }

  const onCopy = () => {
    if (!fullMarkdown || isCopied) {
      return;
    }
    copyToClipboard(fullMarkdown);
  };

  return (
    <div className="min-w-0">
      {textParts.map((part, index) => (
        <AssistantMarkdownPart key={`text-${index}`} text={part.text} />
      ))}
      {fullMarkdown ? (
        <div className="aui-md-actions mt-1 flex justify-start">
          <TooltipIconButton tooltip="Copy message" onClick={onCopy}>
            {!isCopied && <CopyIcon className="size-3.5" />}
            {isCopied && <CheckIcon className="size-3.5" />}
          </TooltipIconButton>
        </div>
      ) : null}
    </div>
  );
};

const MarkdownTextImpl = () => {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className="aui-md max-w-none text-foreground"
      components={mdComponents}
    />
  );
};
export const MarkdownText = memo(MarkdownTextImpl);
