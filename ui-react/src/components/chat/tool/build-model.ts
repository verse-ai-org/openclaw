import type { ReactNode } from "react";
import type { ToolDetailField } from "./sections";
import type { ToolStatus } from "./types";
import type { ToolCategory } from "./classify";
import { classifyTool, formatToolLabel } from "./classify";
import { buildArgsInfo } from "./build-args-info";
import { buildResultInfo } from "./build-result-info";
import { resolveRichToolPresentation } from "./rich-presentation";

export interface ToolDetailModel {
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

export function resultIndicatesError(str: string | undefined): boolean {
  if (!str) { return false; }
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

export function buildToolDetailModel({
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
    summaryPreview: summaryPreview ?? "",
    errorMessage,
    argsFields: argsInfo.fields,
    resultFields: resultInfo.fields,
    richContent: richPresentation?.content,
    canPromoteRichContent: richPresentation?.canPromote,
  };
}
