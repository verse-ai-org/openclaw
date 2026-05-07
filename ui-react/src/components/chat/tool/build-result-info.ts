import type { ToolDetailField } from "./sections";
import type { ToolCategory } from "./classify";
import { truncateMiddle, parseJsonObject } from "./build-args-info";

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

export function summarizeLineCount(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) { return undefined; }
  const lineCount = trimmed.split(/\r?\n/).length;
  return `${lineCount} line${lineCount === 1 ? "" : "s"}`;
}

export function buildResultInfo(
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
    if (!value) { return; }
    const uniqueKey = `${label}:${value}`;
    if (seen.has(uniqueKey)) { return; }
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
