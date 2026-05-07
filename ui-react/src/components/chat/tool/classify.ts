import {
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
import type { ToolCategoryConfig } from "./types";

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
  if (/\bread\b|get|fetch|load|view|cat|head|tail/.test(lower)) { return "read"; }
  if (/\bwrite\b|edit|update|patch|create|insert|append|save|put/.test(lower)) { return "write"; }
  if (/\bexec\b|run|execute|shell|bash|cmd|terminal|spawn|call/.test(lower)) { return "exec"; }
  if (/\bsearch\b|find|grep|query|lookup|rg|scan/.test(lower)) { return "search"; }
  if (/\bweb\b|http|url|browse|crawl|download|request|curl/.test(lower)) { return "web"; }
  if (/\bdb\b|database|sql|mongo|redis|store/.test(lower)) { return "database"; }
  if (/\bfile\b|dir|ls|mkdir|rm|cp|mv|move|copy|path/.test(lower)) { return "file"; }
  if (/function|call|invoke|dispatch/.test(lower)) { return "function"; }
  return "default";
}

export const TOOL_CATEGORY_CONFIG: Record<ToolCategory, ToolCategoryConfig> = {
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
