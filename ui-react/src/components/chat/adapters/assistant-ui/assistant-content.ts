import type {
  AssistantContentPart,
  AssistantToolPart,
  AssistantUiToolPart,
} from "@/components/chat/types";
import { decodeUiSurfaceFromToolCallPart } from "./ui-surface-tool-call";

function isTextPart(value: unknown): value is Extract<AssistantContentPart, { type: "text" }> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const v = value as Record<string, unknown>;
  return v.type === "text" && typeof v.text === "string";
}

function isToolCallPart(
  value: unknown,
): value is Extract<AssistantContentPart, { type: "tool-call" }> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const v = value as Record<string, unknown>;
  return v.type === "tool-call";
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
  const toolPartsRaw: Array<Extract<AssistantContentPart, { type: "tool-call" }>> = [];
  const uiParts: AssistantUiToolPart[] = [];

  for (const part of raw) {
    if (isTextPart(part)) {
      content.push(part);
      textParts.push(part);
      continue;
    }
    if (isToolCallPart(part)) {
      content.push(part as Extract<AssistantContentPart, { type: "tool-call" }>);
      toolPartsRaw.push(part as Extract<AssistantContentPart, { type: "tool-call" }>);
    }
  }

  // UI surfaces are encoded as special tool-call parts (see toAssistantUiThreadMessage).
  const toolParts: Array<Extract<AssistantContentPart, { type: "tool-call" }>> = [];
  for (const p of toolPartsRaw) {
    const decoded = decodeUiSurfaceFromToolCallPart({
      type: "tool-call",
      toolCallId: p.toolCallId,
      toolName: p.toolName,
      args: p.args,
    });
    if (decoded) {
      uiParts.push(decoded);
    } else {
      toolParts.push(p);
    }
  }

  const textContent = textParts.map((part) => part.text).join("\n\n").trim();
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
  for (const part of slice) {
    if (!part || typeof part !== "object") {
      continue;
    }
    const p = part as Record<string, unknown>;
    if (p.type !== "tool-call") {
      continue;
    }
    // The runtime tool-call part shape is compatible with AssistantToolPart.
    out.push(part as AssistantToolPart);
  }
  return out;
}

