import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import {
  CheckIcon,
  LoaderIcon,
  XCircleIcon,
  ExternalLinkIcon,
  FileTextIcon,
  TerminalIcon,
  PencilIcon,
  SearchIcon,
  GlobeIcon,
  FunctionSquareIcon,
  DatabaseIcon,
  FolderIcon,
  WrenchIcon,
} from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { plainMdComponents } from "./markdown-components";

// ---------------------------------------------------------------------------
// Tool type classification
// ---------------------------------------------------------------------------

type ToolCategory =
  | "read"
  | "write"
  | "exec"
  | "search"
  | "web"
  | "database"
  | "file"
  | "function"
  | "default";

function classifyTool(name: string): ToolCategory {
  const lower = name.toLowerCase();
  if (/\bread\b|get|fetch|load|view|cat|head|tail/.test(lower)) {
    return "read";
  }
  if (/\bwrite\b|edit|update|patch|create|insert|append|save|put/.test(lower)) {
    return "write";
  }
  if (/\bexec\b|run|execute|shell|bash|cmd|terminal|spawn|call/.test(lower)) {
    return "exec";
  }
  if (/\bsearch\b|find|grep|query|lookup|rg|scan/.test(lower)) {
    return "search";
  }
  if (/\bweb\b|http|url|browse|crawl|download|request|curl/.test(lower)) {
    return "web";
  }
  if (/\bdb\b|database|sql|mongo|redis|store/.test(lower)) {
    return "database";
  }
  if (/\bfile\b|dir|ls|mkdir|rm|cp|mv|move|copy|path/.test(lower)) {
    return "file";
  }
  if (/function|call|invoke|dispatch/.test(lower)) {
    return "function";
  }
  return "default";
}

const TOOL_CATEGORY_CONFIG: Record<
  ToolCategory,
  {
    Icon: React.ElementType;
    // Tailwind classes for icon background + text in normal state
    iconBg: string;
    iconColor: string;
    // Border accent color
    borderAccent: string;
    // Label shown before tool name (e.g. "Read", "Exec")
    actionLabel: string;
  }
> = {
  read: {
    Icon: FileTextIcon,
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-500",
    borderAccent: "border-l-blue-500",
    actionLabel: "Read",
  },
  write: {
    Icon: PencilIcon,
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-500",
    borderAccent: "border-l-amber-500",
    actionLabel: "Write",
  },
  exec: {
    Icon: TerminalIcon,
    iconBg: "bg-purple-500/10",
    iconColor: "text-purple-500",
    borderAccent: "border-l-purple-500",
    actionLabel: "Exec",
  },
  search: {
    Icon: SearchIcon,
    iconBg: "bg-teal-500/10",
    iconColor: "text-teal-500",
    borderAccent: "border-l-teal-500",
    actionLabel: "Search",
  },
  web: {
    Icon: GlobeIcon,
    iconBg: "bg-sky-500/10",
    iconColor: "text-sky-500",
    borderAccent: "border-l-sky-500",
    actionLabel: "Web",
  },
  database: {
    Icon: DatabaseIcon,
    iconBg: "bg-orange-500/10",
    iconColor: "text-orange-500",
    borderAccent: "border-l-orange-500",
    actionLabel: "Database",
  },
  file: {
    Icon: FolderIcon,
    iconBg: "bg-yellow-500/10",
    iconColor: "text-yellow-500",
    borderAccent: "border-l-yellow-500",
    actionLabel: "File",
  },
  function: {
    Icon: FunctionSquareIcon,
    iconBg: "bg-indigo-500/10",
    iconColor: "text-indigo-500",
    borderAccent: "border-l-indigo-500",
    actionLabel: "Call",
  },
  default: {
    Icon: WrenchIcon,
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    borderAccent: "border-l-border",
    actionLabel: "Tool",
  },
};

// ---------------------------------------------------------------------------
// Status types & icons
// ---------------------------------------------------------------------------

type ToolStatus = "running" | "complete" | "incomplete";

interface StatusBadgeProps {
  status: ToolStatus;
  isCancelled: boolean;
}

function StatusBadge({ status, isCancelled }: StatusBadgeProps) {
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a snake_case or camelCase tool name into a human-readable label. */
function formatToolLabel(name: string): string {
  return name
    .replace(/[_-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// ---------------------------------------------------------------------------
// ToolDetailDrawer
interface ToolDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolLabel: string;
  actionLabel: string;
  argsText: string | null | undefined;
  resultStr: string | undefined;
  statusType: ToolStatus;
  isCancelled: boolean;
  errorMessage?: string;
  category: ToolCategory;
}

function ToolDetailDrawer({
  open,
  onOpenChange,
  toolLabel,
  argsText,
  resultStr,
  statusType,
  isCancelled,
  errorMessage,
  category,
}: ToolDetailDrawerProps) {
  const cfg = TOOL_CATEGORY_CONFIG[category];
  const Icon = cfg.Icon;
  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full w-200 sm:max-w-120">
        {/* Fixed header */}
        <DrawerHeader className="border-b">
          <DrawerTitle className="flex items-center gap-2.5">
            <span className={cn("flex size-7 items-center justify-center rounded-md", cfg.iconBg)}>
              <Icon className={cn("size-4", cfg.iconColor)} />
            </span>
            <span className={cn(isCancelled && "line-through text-muted-foreground")}>
              {toolLabel}
            </span>
            <StatusBadge status={statusType} isCancelled={isCancelled} />
          </DrawerTitle>
          {isCancelled && (
            <p className="text-xs text-muted-foreground">This tool call was cancelled.</p>
          )}
        </DrawerHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Arguments */}
          {argsText && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Arguments
              </h3>
              <pre className="rounded-lg border bg-muted/50 p-3 text-xs leading-relaxed whitespace-pre-wrap break-all">
                {argsText}
              </pre>
            </section>
          )}

          {/* Error */}
          {statusType === "incomplete" && errorMessage && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-destructive">
                {isCancelled ? "Cancelled reason" : "Error"}
              </h3>
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">
                {errorMessage}
              </p>
            </section>
          )}

          {/* Result — rendered as Markdown */}
          {!isCancelled && resultStr !== undefined && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Result
              </h3>
              <div className="text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={plainMdComponents}>
                  {resultStr}
                </ReactMarkdown>
              </div>
            </section>
          )}

          {/* No content */}
          {!argsText && resultStr === undefined && statusType === "complete" && (
            <p className="text-sm text-muted-foreground">Tool completed with no output.</p>
          )}
        </div>

        {/* Fixed footer */}
        <DrawerFooter className="border-t">
          <DrawerClose asChild>
            <Button variant="outline" className="w-full">
              Close
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// ToolFallback — main card component
// ---------------------------------------------------------------------------
const ToolFallbackImpl: ToolCallMessagePartComponent = ({ toolName, argsText, result, status }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const statusType: ToolStatus =
    status?.type === "running"
      ? "running"
      : status?.type === "incomplete"
        ? "incomplete"
        : "complete";

  const isCancelled = status?.type === "incomplete" && status.reason === "cancelled";
  const category = classifyTool(toolName);
  const cfg = TOOL_CATEGORY_CONFIG[category];
  const Icon = cfg.Icon;

  const toolLabel = formatToolLabel(toolName);

  // Result string for display
  const resultStr =
    typeof result === "string"
      ? result
      : result != null
        ? JSON.stringify(result, null, 2)
        : undefined;

  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.log("[ToolFallback]", toolName, { result, resultStr, status });
  }

  const errorMessage =
    status?.type === "incomplete" && status.error
      ? typeof status.error === "string"
        ? status.error
        : JSON.stringify(status.error)
      : undefined;

  // Only allow opening drawer when not running
  const canViewDetail = statusType !== "running";

  return (
    <>
      <Card
        className={cn(
          "w-full overflow-hidden border-l-4 text-sm my-2 py-1 transition-colors",
          cfg.borderAccent,
          statusType === "incomplete"
            ? "border-destructive/40 bg-destructive/5"
            : isCancelled
              ? "bg-muted/30"
              : "bg-card",
        )}
      >
        <CardHeader className="flex flex-row items-center gap-2.5 p-3">
          {/* Category icon */}
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-md",
              cfg.iconBg,
            )}
          >
            <Icon className={cn("size-4", cfg.iconColor)} />
          </span>

          {/* Action label + tool name */}
          <div className="flex flex-1 flex-col gap-0.5 min-w-0">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {cfg.actionLabel}
            </span>
            <span
              className={cn(
                "truncate font-semibold leading-tight",
                isCancelled && "line-through text-muted-foreground",
              )}
            >
              {toolLabel}
            </span>
          </div>

          {/* Status badge */}
          <StatusBadge status={statusType} isCancelled={isCancelled} />

          {/* View details button */}
          {canViewDetail && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="View tool details"
            >
              <ExternalLinkIcon className="size-3" />
              Details
            </button>
          )}
        </CardHeader>
      </Card>

      {/* Drawer — portal'd outside card */}
      <ToolDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        toolLabel={toolLabel}
        actionLabel={cfg.actionLabel}
        argsText={argsText}
        resultStr={resultStr}
        statusType={statusType}
        isCancelled={isCancelled}
        errorMessage={errorMessage}
        category={category}
      />
    </>
  );
};

ToolFallbackImpl.displayName = "ToolFallback";

export const ToolFallback = ToolFallbackImpl;
