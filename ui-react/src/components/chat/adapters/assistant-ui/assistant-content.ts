import type {
  AssistantContentPart,
  AssistantToolPart,
  AssistantUiToolPart,
} from "@/components/chat/types";
import { decodeUiSurfaceFromToolCallPart } from "./ui-surface-tool-call";

/**
 * Normalize a single assistant-ui message content element to our wire protocol
 * (`AssistantContentPart`: `text` | `tool-call`). Unknown or malformed entries
 * are dropped (same as silently skipping non-matching parts in a for-loop).
 */
function tryNormalizeAssistantContentPart(value: unknown): AssistantContentPart | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const v = value as Record<string, unknown>;
  if (v.type === "text" && typeof v.text === "string") {
    return { type: "text", text: v.text };
  }
  if (v.type === "tool-call") {
    return value as Extract<AssistantContentPart, { type: "tool-call" }>;
  }
  return null;
}

export function splitAssistantContentParts(rawContent: unknown): {
  content: AssistantContentPart[];
  textParts: Array<Extract<AssistantContentPart, { type: "text" }>>;
  toolParts: Array<Extract<AssistantContentPart, { type: "tool-call" }>>;
  uiParts: AssistantUiToolPart[];
  textContent: string;
} {
  const raw = Array.isArray(rawContent) ? rawContent : [];
  const content: AssistantContentPart[] = [];
  const textParts: Array<Extract<AssistantContentPart, { type: "text" }>> = [];
  const toolParts: Array<Extract<AssistantContentPart, { type: "tool-call" }>> = [];
  const uiParts: AssistantUiToolPart[] = [];

  for (const item of raw) {
    const part = tryNormalizeAssistantContentPart(item);
    if (!part) {
      continue;
    }
    content.push(part);
    if (part.type === "text") {
      textParts.push(part);
      continue;
    }
    const decoded = decodeUiSurfaceFromToolCallPart(part);
    if (decoded) {
      uiParts.push(decoded);
    } else {
      toolParts.push(part);
    }
  }

  const textContent = textParts.map((p) => p.text).join("\n\n").trim();
  return { content, textParts, toolParts, uiParts, textContent };
}

export function sliceToolCallParts(
  rawContent: unknown,
  startIndex: number,
  endIndex: number,
): AssistantToolPart[] {
  if (!Array.isArray(rawContent)) {
    return [];
  }
  const slice = rawContent.slice(startIndex, endIndex + 1);
  const out: AssistantToolPart[] = [];
  for (const item of slice) {
    const part = tryNormalizeAssistantContentPart(item);
    if (part?.type === "tool-call") {
      out.push(part);
    }
  }
  return out;
}
