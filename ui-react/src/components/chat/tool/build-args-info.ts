import type { ToolDetailField } from "./sections";
import { classifyTool } from "./classify";

export function truncateMiddle(text: string, max = 96): string {
  if (text.length <= max) { return text; }
  const side = Math.floor((max - 1) / 2);
  return `${text.slice(0, side)}…${text.slice(text.length - side)}`;
}

export function parseJsonObject(text: string | undefined): Record<string, unknown> | null {
  if (!text) { return null; }
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

export function buildArgsInfo(
  toolName: string,
  argsText: string | null | undefined,
): {
  preview: string;
  fields: ToolDetailField[];
} {
  if (!argsText) { return { preview: "", fields: [] }; }
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
      typeof obj[key] === "string" && (obj[key] as string).trim().length > 0
        ? (obj[key] as string).trim()
        : undefined;
    const pushField = (label: string, value: string | undefined) => {
      if (!value) { return; }
      const uniqueKey = `${label}:${value}`;
      if (seen.has(uniqueKey)) { return; }
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
        if (fields.length >= 4) { break; }
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
