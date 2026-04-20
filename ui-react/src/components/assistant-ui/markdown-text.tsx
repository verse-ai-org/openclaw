import { FC, memo } from "react";
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
function CodeWithContext({ className, ...props }: React.ComponentPropsWithoutRef<"code">) {
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
}

// ---------------------------------------------------------------------------
// Shared element styles (no hook usage)
// ---------------------------------------------------------------------------
const sharedElements: Components = {
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
      className={cn(
        "text-lg font-semibold tracking-tight mt-3 mb-1 first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  h6: ({ className, ...props }) => (
    <h6
      className={cn(
        "text-base font-semibold tracking-tight mt-3 mb-1 first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  p: ({ className, ...props }) => (
    <p className={cn("leading-7 not-first:mt-4", className)} {...props} />
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn(
        "text-primary underline underline-offset-4 hover:text-primary/80",
        className,
      )}
      {...props}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn("mt-6 border-l-2 pl-6 italic", className)}
      {...props}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn("my-6 ml-6 list-disc [&>li]:mt-2", className)}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn("my-6 ml-6 list-decimal [&>li]:mt-2", className)}
      {...props}
    />
  ),
  li: ({ className, ...props }) => (
    <li className={cn("leading-7", className)} {...props} />
  ),
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
    <tr
      className={cn("m-0 border-t p-0 even:bg-muted", className)}
      {...props}
    />
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
        "aui-md-pre overflow-x-auto rounded-lg border border-border/50 bg-muted/30 p-3 text-xs leading-relaxed",
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
            "aui-md-inline-code rounded-md border border-border/50 bg-muted/50 px-1 py-1 font-mono text-sm",
          className,
        )}
        {...props}
      />
    );
  },
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
      {isBlock && <CodeHeader language={className?.replace("language-", "")} code={props.children as string} />}
      <code
        className={cn(
          !isBlock &&
            "relative rounded px-1 py-1 font-mono text-sm",
          className,
        )}
        {...props}
      />
      </>
    );
  }
};

export const AssistantMarkdown: FC<{ text: string }> = ({ text }) => {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={plainMdComponents}>
      {text}
    </ReactMarkdown>
  );
}

export const AssistantMarkdownPart = memo(AssistantMarkdown);

const MarkdownTextImpl = () => {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className="aui-md"
      components={mdComponents}
    />
  );
};
export const MarkdownText = memo(MarkdownTextImpl);
