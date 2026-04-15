import {
  ChevronRightIcon,
  DatabaseIcon,
  FileTextIcon,
  FolderIcon,
  FunctionSquareIcon,
  GlobeIcon,
  PencilIcon,
  SearchIcon,
  TerminalIcon,
  WrenchIcon,
} from "lucide-react";
import { useState, type FC, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { type ToolDetailField } from "./sections";
import { resolveRichToolPresentation } from "./rich-presentation";
import { StatusBadge } from "./status-badge";
import { ToolDetailDrawer } from "./tool-detail-drawer";
import type { ToolCategoryConfig, ToolStatus } from "./types";

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
  if (/\bwrite\b|edit|update|patch|create|insert|append|save|put/.test(lower))
    return "write";
  if (/\bexec\b|run|execute|shell|bash|cmd|terminal|spawn|call/.test(lower))
    return "exec";
  if (/\bsearch\b|find|grep|query|lookup|rg|scan/.test(lower)) return "search";
  if (/\bweb\b|http|url|browse|crawl|download|request|curl/.test(lower))
    return "web";
  if (/\bdb\b|database|sql|mongo|redis|store/.test(lower)) return "database";
  if (/\bfile\b|dir|ls|mkdir|rm|cp|mv|move|copy|path/.test(lower))
    return "file";
  if (/function|call|invoke|dispatch/.test(lower)) return "function";
  return "default";
}

export const TOOL_CATEGORY_CONFIG: Record<
  ToolCategory,
  ToolCategoryConfig
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

export function formatToolLabel(name: string): string {
  return name
    .replace(/[_-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function truncateMiddle(text: string, max = 96): string {
  if (text.length <= max) return text;
  const side = Math.floor((max - 1) / 2);
  return `${text.slice(0, side)}…${text.slice(text.length - side)}`;
}

interface ToolDetailModel {
  toolLabel: string;
  category: ToolCategory;
  statusType: ToolStatus;
  isCancelled: boolean;
  resultStr: string | undefined;
  summaryPreview: string;
  errorMessage?: string;
  argsFields: ToolDetailField[];
  resultFields: ToolDetailField[];
  richContent?: ReactNode;
  canPromoteRichContent?: boolean;
}

function buildArgsInfo(
  toolName: string,
  argsText: string | null | undefined,
): {
  preview: string;
  fields: ToolDetailField[];
} {
  if (!argsText) return { preview: "", fields: [] };
  const fallback = truncateMiddle(argsText.replace(/\s+/g, " ").trim(), 96);

  try {
    const parsed = JSON.parse(argsText) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { preview: fallback, fields: [] };
    }

    const obj = parsed as Record<string, unknown>;
    const fields: ToolDetailField[] = [];
    const seen = new Set<string>();
    const readString = (key: string) =>
      typeof obj[key] === "string" && obj[key].trim().length > 0
        ? obj[key].trim()
        : undefined;
    const pushField = (label: string, value: string | undefined) => {
      if (!value) return;
      const uniqueKey = `${label}:${value}`;
      if (seen.has(uniqueKey)) return;
      seen.add(uniqueKey);
      fields.push({ label, value });
    };

    const category = classifyTool(toolName);
    if (category === "exec") {
      pushField("Command", readString("command") ?? readString("cmd"));
      pushField("Directory", readString("cwd") ?? readString("working_directory"));
    }

    if (category === "read" || category === "write" || category === "file") {
      pushField(
        "Path",
        readString("path") ?? readString("file") ?? readString("target"),
      );
    }

    if (category === "search") {
      pushField(
        "Query",
        readString("query") ?? readString("pattern") ?? readString("keyword"),
      );
      pushField("Scope", readString("path") ?? readString("glob"));
    }

    if (category === "web") {
      pushField("URL", readString("url"));
      pushField("Method", readString("method"));
    }

    pushField("Action", readString("action"));
    pushField("Session", readString("sessionId") ?? readString("session"));

    if (fields.length === 0) {
      for (const [key, value] of Object.entries(obj)) {
        if (fields.length >= 4) break;
        if (["string", "number", "boolean"].includes(typeof value)) {
          pushField(key, String(value));
        }
      }
    }

    const preview =
      fields.length > 0
        ? truncateMiddle(
            fields
              .slice(0, 2)
              .map((field) => field.value)
              .join(" · "),
            110,
          )
        : fallback;

    return { preview, fields };
  } catch {
    return { preview: fallback, fields: [] };
  }
}

function getObjectString(
  obj: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function getObjectNumber(
  obj: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function getObjectBoolean(
  obj: Record<string, unknown>,
  ...keys: string[]
): boolean | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

function parseJsonObject(text: string | undefined): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function summarizeLineCount(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const lineCount = trimmed.split(/\r?\n/).length;
  return `${lineCount} line${lineCount === 1 ? "" : "s"}`;
}

function buildResultInfo(
  category: ToolCategory,
  resultStr: string | undefined,
): {
  summary?: string;
  fields: ToolDetailField[];
} {
  if (!resultStr) {
    return { summary: undefined, fields: [] };
  }

  const fields: ToolDetailField[] = [];
  const seen = new Set<string>();
  const pushField = (label: string, value: string | undefined) => {
    if (!value) return;
    const uniqueKey = `${label}:${value}`;
    if (seen.has(uniqueKey)) return;
    seen.add(uniqueKey);
    fields.push({ label, value });
  };

  const parsed = parseJsonObject(resultStr);

  if (parsed) {
    const status = getObjectString(parsed, "status");
    const message = getObjectString(parsed, "message", "summary");
    const title = getObjectString(parsed, "title", "name");
    const path = getObjectString(parsed, "path", "file", "target");
    const url = getObjectString(parsed, "url");
    const command = getObjectString(parsed, "command", "cmd");
    const error = getObjectString(parsed, "error");
    const exitCode = getObjectNumber(parsed, "exitCode", "exit_code");
    const count = getObjectNumber(parsed, "count", "total", "results", "matches");
    const ok = getObjectBoolean(parsed, "ok", "success");

    switch (category) {
      case "exec": {
        pushField("Exit code", exitCode !== undefined ? String(exitCode) : undefined);
        pushField("Status", status ?? (ok === true ? "success" : undefined));
        pushField("Command", command);
        pushField("Message", message);
        return {
          summary:
            command && exitCode !== undefined
              ? `${truncateMiddle(command, 72)} · exit ${exitCode}`
              : command ?? message ?? status,
          fields,
        };
      }
      case "read": {
        pushField("Path", path);
        pushField("Lines", summarizeLineCount(resultStr));
        pushField("Title", title);
        pushField("Message", message);
        return {
          summary: path ?? title ?? message ?? summarizeLineCount(resultStr),
          fields,
        };
      }
      case "search": {
        pushField("Matches", count !== undefined ? String(count) : undefined);
        pushField("Path", path);
        pushField("Status", status);
        pushField("Message", message);
        return {
          summary:
            count !== undefined
              ? `${count} match${count === 1 ? "" : "es"}`
              : message ?? status,
          fields,
        };
      }
      case "web": {
        pushField("URL", url);
        pushField("Status", status ?? (ok === true ? "success" : undefined));
        pushField("Title", title);
        pushField("Message", message);
        return {
          summary: title ?? url ?? message ?? status,
          fields,
        };
      }
      case "file":
      case "write": {
        pushField("Path", path);
        pushField("Status", status ?? (ok === true ? "success" : undefined));
        pushField("Message", message);
        return {
          summary: message ?? path ?? status,
          fields,
        };
      }
      default: {
        pushField("Title", title);
        pushField("Status", status ?? (ok === true ? "success" : undefined));
        pushField("Message", message ?? error);
        return {
          summary: title ?? message ?? error,
          fields,
        };
      }
    }
  }

  const plainSummary = truncateMiddle(resultStr.replace(/\s+/g, " ").trim(), 110);

  switch (category) {
    case "exec":
      return {
        summary: plainSummary,
        fields: summarizeLineCount(resultStr)
          ? [{ label: "Output", value: summarizeLineCount(resultStr)! }]
          : [],
      };
    case "read":
    case "search":
    case "web":
    case "file":
    case "write":
      return {
        summary: plainSummary,
        fields: summarizeLineCount(resultStr)
          ? [{ label: "Output", value: summarizeLineCount(resultStr)! }]
          : [],
      };
    default:
      return { summary: plainSummary, fields: [] };
  }
}

function buildToolDetailModel({
  toolName,
  argsText,
  result,
  status,
  isError,
}: Pick<
  ToolFallbackPartProps,
  "toolName" | "argsText" | "result" | "status" | "isError"
>): ToolDetailModel {
  const resultStr =
    typeof result === "string"
      ? result
      : result != null
        ? JSON.stringify(result, null, 2)
        : undefined;
  const hasResultError = resultIndicatesError(resultStr);
  const statusType: ToolStatus =
    status?.type === "running"
      ? "running"
      : status?.type === "incomplete" || isError === true || hasResultError
        ? "incomplete"
        : "complete";
  const isCancelled =
    status?.type === "incomplete" && status.reason === "cancelled";
  const category = classifyTool(toolName);
  const toolLabel = formatToolLabel(toolName);
  const argsInfo = buildArgsInfo(toolName, argsText);
  const resultInfo = buildResultInfo(category, resultStr);
  const richPresentation =
    statusType === "complete"
      ? resolveRichToolPresentation(toolName, result, resultStr)
      : null;
  const summaryPreview =
    richPresentation?.summary ?? resultInfo.summary ?? argsInfo.preview;
  const errorMessage =
    status?.type === "incomplete" && status.error
      ? typeof status.error === "string"
        ? status.error
        : JSON.stringify(status.error)
      : hasResultError && resultStr
        ? (() => {
            try {
              const obj = JSON.parse(resultStr) as Record<string, unknown>;
              return typeof obj.error === "string" ? obj.error : resultStr;
            } catch {
              return resultStr;
            }
          })()
        : undefined;

  return {
    toolLabel,
    category,
    statusType,
    isCancelled,
    resultStr,
    summaryPreview,
    errorMessage,
    argsFields: argsInfo.fields,
    resultFields: resultInfo.fields,
    richContent: richPresentation?.content,
    canPromoteRichContent: richPresentation?.canPromote,
  };
}

function resultIndicatesError(str: string | undefined): boolean {
  if (!str) return false;
  try {
    const parsed = JSON.parse(str) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      return (
        obj.status === "error" ||
        (typeof obj.error === "string" && obj.error.length > 0)
      );
    }
  } catch {
    return /^error[:\s]/i.test(str.trimStart());
  }
  return false;
}

export type ToolFallbackJsonValue =
  | string
  | number
  | boolean
  | null
  | ToolFallbackJsonValue[]
  | ToolFallbackJsonObject;
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
    | {
        type: "incomplete";
        reason: "length" | "error" | "cancelled" | "other" | "content-filter";
        error?: unknown;
      };
  addResult?: (result: unknown) => void;
  resume?: (payload: unknown) => void;
}

const ToolFallbackImpl: FC<ToolFallbackPartProps> = ({
  toolName,
  argsText,
  result,
  status,
  isError,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const detailModel = buildToolDetailModel({
    toolName,
    argsText,
    result,
    status,
    isError,
  });
  const {
    toolLabel,
    category,
    statusType,
    isCancelled,
    resultStr,
    summaryPreview,
    errorMessage,
    argsFields,
    resultFields,
    richContent,
    canPromoteRichContent,
  } = detailModel;

  const cfg = TOOL_CATEGORY_CONFIG[category];
  const Icon = cfg.Icon;
  const canViewDetail = true;

  return (
    <>
      <div
        className={cn(
          "my-1 overflow-hidden rounded-lg border bg-white hover:bg-white/50 text-sm transition-colors",
          statusType === "incomplete"
            ? "border-destructive/60 bg-destructive/5"
            : cfg.borderAccent,
          canViewDetail && "cursor-pointer hover:bg-white/80",
        )}
        role={canViewDetail ? "button" : undefined}
        tabIndex={canViewDetail ? 0 : undefined}
        onClick={canViewDetail ? () => setDrawerOpen(true) : undefined}
        onKeyDown={
          canViewDetail
            ? (e) => (e.key === "Enter" || e.key === " ") && setDrawerOpen(true)
            : undefined
        }
        aria-label={canViewDetail ? `View details for ${toolLabel}` : undefined}
      >
        <div className="flex w-full items-center gap-2.5 px-3 py-2.5">
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-md",
              cfg.iconBg,
            )}
          >
            <Icon className={cn("size-3.5", cfg.iconColor)} />
          </span>
          <span className="flex flex-1 items-baseline gap-1.5 min-w-0">
            <span className="shrink-0 text-sm text-muted-foreground">
              {cfg.actionLabel}
            </span>
            {!!argsFields?.[0]?.value && (
              <span className="truncate text-xs text-muted-foreground">
                - {argsFields?.[0]?.value}
              </span>
            )}
          </span>
          <StatusBadge status={statusType} isCancelled={isCancelled} />
          {canViewDetail && (
            <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
          )}
        </div>
      </div>
      <ToolDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        toolLabel={toolLabel}
        argsText={argsText}
        argsFields={argsFields}
        resultFields={resultFields}
        summaryPreview={summaryPreview}
        resultStr={resultStr}
        statusType={statusType}
        isCancelled={isCancelled}
        errorMessage={errorMessage}
        categoryConfig={cfg}
        richContent={richContent}
        canPromoteRichContent={canPromoteRichContent}
      />
    </>
  );
};

ToolFallbackImpl.displayName = "ToolFallback";
export const ToolFallback = ToolFallbackImpl;
