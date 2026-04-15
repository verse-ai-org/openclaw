import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { plainMdComponents } from "../../assistant-ui/markdown-text";

export interface ToolDetailField {
  label: string;
  value: string;
}

interface ToolSectionProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

export function ToolSection({ title, action, children }: ToolSectionProps) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

interface ToolFieldListProps {
  fields: ToolDetailField[];
  className?: string;
}

export function ToolFieldList({ fields, className }: ToolFieldListProps) {
  return (
    <dl className={cn("flex flex-col gap-3", className)}>
      {fields.map((field) => (
        <div
          key={`${field.label}-${field.value}`}
          className="rounded-md border bg-background px-3 py-2"
        >
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {field.label}
          </dt>
          <dd className="mt-1 break-words text-sm text-foreground">
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface RawToggleSectionProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  persistentContent?: ReactNode;
  expandedContent?: ReactNode;
  collapsedHint?: string;
}

export function RawToggleSection({
  title,
  isExpanded,
  onToggle,
  persistentContent,
  expandedContent,
  collapsedHint,
}: RawToggleSectionProps) {
  return (
    <ToolSection
      title={title}
      action={
        <Button variant="ghost" size="sm" onClick={onToggle}>
          {isExpanded ? "Hide raw" : "Show raw"}
        </Button>
      }
    >
      <div className="space-y-3">
        {persistentContent}
        {isExpanded ? (
          expandedContent
        ) : collapsedHint ? (
          <p className="rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            {collapsedHint}
          </p>
        ) : null}
      </div>
    </ToolSection>
  );
}

function parseMarkdown(markdown: string): {
  frontmatter: string;
  body: string;
} {
  const content = markdown.trimStart();
  if (!content.startsWith("---\n")) return { frontmatter: "", body: markdown };
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) return { frontmatter: "", body: markdown };
  return {
    frontmatter: content.slice(4, end).trim(),
    body: content.slice(end + 5).trimStart(),
  };
}

interface RawResultContentProps {
  resultStr: string;
}

export function RawResultContent({ resultStr }: RawResultContentProps) {
  const { frontmatter, body } = parseMarkdown(resultStr);

  return (
    <div className="flex flex-col gap-3 text-sm leading-6">
      {frontmatter && (
        <details className="rounded-md border bg-background/70 p-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Metadata (frontmatter)
          </summary>
          <pre className="mt-2 overflow-auto rounded bg-muted/60 p-2 text-xs leading-5 whitespace-pre-wrap break-words font-mono">
            {frontmatter}
          </pre>
        </details>
      )}
      <div className="rounded-lg border bg-background p-3">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={plainMdComponents}>
          {body || resultStr}
        </ReactMarkdown>
      </div>
    </div>
  );
}
