import {
  CheckIcon,
  ChevronRightIcon,
  DatabaseIcon,
  FileTextIcon,
  FolderIcon,
  FunctionSquareIcon,
  GlobeIcon,
  LoaderIcon,
  PencilIcon,
  SearchIcon,
  TerminalIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import { useState, type FC, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { plainMdComponents } from "../assistant-ui/markdown-text";
import { resolveRichToolPresentation } from "./tool-rich-presentation";

export type ToolCategory =
  | "read"
  | "write"
  | "exec"
  | "search"
  | "web"
  | "database"
  | "file"
  | "function"
  | "default";

export function classifyTool(name: string): ToolCategory {
  const lower = name.toLowerCase();
  if (/\bread\b|get|fetch|load|view|cat|head|tail/.test(lower)) return "read";
  if (/\bwrite\b|edit|update|patch|create|insert|append|save|put/.test(lower)) return "write";
  if (/\bexec\b|run|execute|shell|bash|cmd|terminal|spawn|call/.test(lower)) return "exec";
  if (/\bsearch\b|find|grep|query|lookup|rg|scan/.test(lower)) return "search";
  if (/\bweb\b|http|url|browse|crawl|download|request|curl/.test(lower)) return "web";
  if (/\bdb\b|database|sql|mongo|redis|store/.test(lower)) return "database";
  if (/\bfile\b|dir|ls|mkdir|rm|cp|mv|move|copy|path/.test(lower)) return "file";
  if (/function|call|invoke|dispatch/.test(lower)) return "function";
  return "default";
}

export const TOOL_CATEGORY_CONFIG: Record<
  ToolCategory,
  { Icon: React.ElementType; iconBg: string; iconColor: string; borderAccent: string; actionLabel: string }
> = {
  read: { Icon: FileTextIcon, iconBg: "bg-blue-500/10", iconColor: "text-blue-500", borderAccent: "border-l-blue-500", actionLabel: "Read" },
  write: { Icon: PencilIcon, iconBg: "bg-amber-500/10", iconColor: "text-amber-500", borderAccent: "border-l-amber-500", actionLabel: "Write" },
  exec: { Icon: TerminalIcon, iconBg: "bg-purple-500/10", iconColor: "text-purple-500", borderAccent: "border-l-purple-500", actionLabel: "Exec" },
  search: { Icon: SearchIcon, iconBg: "bg-teal-500/10", iconColor: "text-teal-500", borderAccent: "border-l-teal-500", actionLabel: "Search" },
  web: { Icon: GlobeIcon, iconBg: "bg-sky-500/10", iconColor: "text-sky-500", borderAccent: "border-l-sky-500", actionLabel: "Web" },
  database: { Icon: DatabaseIcon, iconBg: "bg-orange-500/10", iconColor: "text-orange-500", borderAccent: "border-l-orange-500", actionLabel: "Database" },
  file: { Icon: FolderIcon, iconBg: "bg-yellow-500/10", iconColor: "text-yellow-500", borderAccent: "border-l-yellow-500", actionLabel: "File" },
  function: { Icon: FunctionSquareIcon, iconBg: "bg-indigo-500/10", iconColor: "text-indigo-500", borderAccent: "border-l-indigo-500", actionLabel: "Call" },
  default: { Icon: WrenchIcon, iconBg: "bg-muted", iconColor: "text-muted-foreground", borderAccent: "border-l-border", actionLabel: "Tool" },
};

type ToolStatus = "running" | "complete" | "incomplete";

interface StatusBadgeProps {
  status: ToolStatus;
  isCancelled: boolean;
}

function StatusBadge({ status, isCancelled }: StatusBadgeProps) {
  if (status === "running") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"><LoaderIcon className="size-3 animate-spin" />Running</span>;
  }
  if (status === "incomplete") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive"><XCircleIcon className="size-3" />{isCancelled ? "Cancelled" : "Failed"}</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400"><CheckIcon className="size-3" />Done</span>;
}

export function formatToolLabel(name: string): string {
  return name.replace(/[_-]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

function parseMarkdown(markdown: string): { frontmatter: string; body: string } {
  const content = markdown.trimStart();
  if (!content.startsWith("---\n")) return { frontmatter: "", body: markdown };
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) return { frontmatter: "", body: markdown };
  return { frontmatter: content.slice(4, end).trim(), body: content.slice(end + 5).trimStart() };
}

function truncateMiddle(text: string, max = 96): string {
  if (text.length <= max) return text;
  const side = Math.floor((max - 1) / 2);
  return `${text.slice(0, side)}…${text.slice(text.length - side)}`;
}

function buildArgsPreview(toolName: string, argsText: string | null | undefined): string {
  if (!argsText) return "";
  const fallback = truncateMiddle(argsText.replace(/\s+/g, " ").trim(), 96);
  try {
    const parsed = JSON.parse(argsText) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
    const obj = parsed as Record<string, unknown>;
    const readString = (key: string) => typeof obj[key] === "string" && obj[key].trim().length > 0 ? obj[key].trim() : undefined;
    const category = classifyTool(toolName);
    if (category === "exec") {
      const command = readString("command") ?? readString("cmd");
      if (command) return truncateMiddle(command, 110);
    }
    if (category === "read" || category === "write" || category === "file") {
      const path = readString("path") ?? readString("file") ?? readString("target");
      if (path) return truncateMiddle(path, 110);
    }
    if (category === "search") {
      const query = readString("query") ?? readString("pattern") ?? readString("keyword");
      if (query) return truncateMiddle(query, 110);
    }
    const action = readString("action");
    const sessionId = readString("sessionId") ?? readString("session");
    if (action && sessionId) return `${action} (${sessionId})`;
    if (action) return action;
    const url = readString("url");
    if (url) return truncateMiddle(url, 110);
    const compact = Object.entries(obj)
      .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
      .slice(0, 2)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(", ");
    return compact ? truncateMiddle(compact, 110) : fallback;
  } catch {
    return fallback;
  }
}

function resultIndicatesError(str: string | undefined): boolean {
  if (!str) return false;
  try {
    const parsed = JSON.parse(str) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      return obj.status === "error" || (typeof obj.error === "string" && obj.error.length > 0);
    }
  } catch {
    return /^error[:\s]/i.test(str.trimStart());
  }
  return false;
}

export type ToolFallbackJsonValue = string | number | boolean | null | ToolFallbackJsonValue[] | ToolFallbackJsonObject;
export type ToolFallbackJsonObject = { [key: string]: ToolFallbackJsonValue };

export interface ToolFallbackPartProps {
  toolName: string;
  args: ToolFallbackJsonObject;
  argsText?: string;
  result?: string;
  isError?: boolean;
  status:
    | { type: "running" }
    | { type: "complete" }
    | { type: "incomplete"; reason: "length" | "error" | "cancelled" | "other" | "content-filter"; error?: unknown };
  addResult?: (result: unknown) => void;
  resume?: (payload: unknown) => void;
}

interface ToolDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolLabel: string;
  argsText: string | null | undefined;
  resultStr: string | undefined;
  statusType: ToolStatus;
  isCancelled: boolean;
  errorMessage?: string;
  category: ToolCategory;
  richContent?: ReactNode;
}

function ToolDetailDrawer({ open, onOpenChange, toolLabel, argsText, resultStr, statusType, isCancelled, errorMessage, category, richContent }: ToolDetailDrawerProps) {
  const cfg = TOOL_CATEGORY_CONFIG[category];
  const Icon = cfg.Icon;
  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full w-[60vw]" style={{ maxWidth: "60vw" }}>
        <DrawerHeader className="border-b">
          <DrawerTitle className="flex items-center gap-2.5">
            <span className={cn("flex size-7 items-center justify-center rounded-md", cfg.iconBg)}><Icon className={cn("size-4", cfg.iconColor)} /></span>
            <span className={cn(isCancelled && "line-through text-muted-foreground")}>{toolLabel}</span>
            <StatusBadge status={statusType} isCancelled={isCancelled} />
          </DrawerTitle>
          {isCancelled && <p className="text-xs text-muted-foreground">This tool call was cancelled.</p>}
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {richContent && !isCancelled && statusType === "complete" && <section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</h3><div className="overflow-hidden">{richContent}</div></section>}
          {argsText && <section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Arguments</h3><pre className="rounded-lg border bg-muted/50 p-3 text-xs leading-relaxed whitespace-pre-wrap break-all">{argsText}</pre></section>}
          {statusType === "incomplete" && errorMessage && <section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-destructive">{isCancelled ? "Cancelled reason" : "Error"}</h3><p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">{errorMessage}</p></section>}
          {!isCancelled && resultStr !== undefined && <section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Raw Result</h3><div className="flex flex-col gap-3 text-sm leading-6">{(() => { const { frontmatter, body } = parseMarkdown(resultStr); return <>{frontmatter && <details className="rounded-md border bg-background/70 p-2"><summary className="cursor-pointer text-xs font-medium text-muted-foreground">Metadata (frontmatter)</summary><pre className="mt-2 overflow-auto rounded bg-muted/60 p-2 text-xs leading-5 whitespace-pre-wrap break-words font-mono">{frontmatter}</pre></details>}<ReactMarkdown remarkPlugins={[remarkGfm]} components={plainMdComponents}>{body || resultStr}</ReactMarkdown></>; })()}</div></section>}
          {!argsText && resultStr === undefined && statusType === "complete" && !richContent && <p className="text-sm text-muted-foreground">Tool completed with no output.</p>}
        </div>
        <DrawerFooter className="border-t"><DrawerClose asChild><Button variant="outline" className="w-full">Close</Button></DrawerClose></DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

const ToolFallbackImpl: FC<ToolFallbackPartProps> = ({ toolName, argsText, result, status, isError }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const resultStr = typeof result === "string" ? result : result != null ? JSON.stringify(result, null, 2) : undefined;
  if (import.meta.env.DEV) console.log("[ToolFallback]", toolName, { result, resultStr, status, isError });
  const hasResultError = resultIndicatesError(resultStr);
  const statusType: ToolStatus = status?.type === "running" ? "running" : status?.type === "incomplete" || isError === true || hasResultError ? "incomplete" : "complete";
  const isCancelled = status?.type === "incomplete" && status.reason === "cancelled";
  const category = classifyTool(toolName);
  const cfg = TOOL_CATEGORY_CONFIG[category];
  const Icon = cfg.Icon;
  const toolLabel = formatToolLabel(toolName);
  const argsPreview = buildArgsPreview(toolName, argsText);
  const richPresentation = statusType === "complete" ? resolveRichToolPresentation(toolName, result, resultStr) : null;
  const summaryPreview = richPresentation?.summary ?? argsPreview;
  const errorMessage = status?.type === "incomplete" && status.error
    ? typeof status.error === "string" ? status.error : JSON.stringify(status.error)
    : hasResultError && resultStr
      ? (() => { try { const obj = JSON.parse(resultStr) as Record<string, unknown>; return typeof obj.error === "string" ? obj.error : resultStr; } catch { return resultStr; } })()
      : undefined;
  const canViewDetail = statusType !== "running";

  return (
    <>
      <div
        className={cn("my-1 overflow-hidden rounded-lg border bg-white hover:bg-white/50 text-sm transition-colors", statusType === "incomplete" ? "border-destructive/60 bg-destructive/5" : cfg.borderAccent, canViewDetail && "cursor-pointer hover:bg-white/80")}
        role={canViewDetail ? "button" : undefined}
        tabIndex={canViewDetail ? 0 : undefined}
        onClick={canViewDetail ? () => setDrawerOpen(true) : undefined}
        onKeyDown={canViewDetail ? (e) => (e.key === "Enter" || e.key === " ") && setDrawerOpen(true) : undefined}
        aria-label={canViewDetail ? `View details for ${toolLabel}` : undefined}
      >
        <div className="flex w-full items-center gap-2.5 px-3 py-2.5">
          <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", cfg.iconBg)}><Icon className={cn("size-3.5", cfg.iconColor)} /></span>
          <span className="flex flex-1 items-baseline gap-1.5 min-w-0">
            <span className="shrink-0 text-sm text-muted-foreground">{cfg.actionLabel}</span>
            {!!summaryPreview && <span className="truncate text-xs text-muted-foreground">- {summaryPreview}</span>}
            {!summaryPreview && !!argsText && <span className="truncate text-xs text-muted-foreground">- {truncateMiddle(argsText.replace(/\s+/g, " ").trim(), 96)}</span>}
          </span>
          <StatusBadge status={statusType} isCancelled={isCancelled} />
          {canViewDetail && <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />}
        </div>
      </div>
      <ToolDetailDrawer open={drawerOpen} onOpenChange={setDrawerOpen} toolLabel={toolLabel} argsText={argsText} resultStr={resultStr} statusType={statusType} isCancelled={isCancelled} errorMessage={errorMessage} category={category} richContent={richPresentation?.content} />
    </>
  );
};

ToolFallbackImpl.displayName = "ToolFallback";
export const ToolFallback = ToolFallbackImpl;
