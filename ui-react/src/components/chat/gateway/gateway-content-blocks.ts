import type { ContentBlock, InteractiveContentBlock } from "@/components/chat/types";
import { isInteractiveToolName, createInteractiveBlock } from "../interactive/blocks";
import { extractTextFromToolResultBlock, resolveToolResultPhase } from "./gateway-tool-parts";

/**
 * Extract ordered ContentBlocks (text + tool-call) from a raw message content array.
 */
export function extractContentBlocks(
  rawContent: unknown,
): ContentBlock[] | undefined {
  if (!Array.isArray(rawContent)) {
    return undefined;
  }

  const blocks = rawContent as Array<Record<string, unknown>>;

  const resultMap = new Map<
    string,
    { result?: string; phase: "result" | "error" }
  >();
  const interactiveMap = new Map<string, InteractiveContentBlock>();
  for (const block of blocks) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const kind = (typeof block.type === "string" ? block.type : "")
      .toLowerCase()
      .replace(/_/g, "");
    if (kind !== "toolresult") {
      continue;
    }
    const id =
      (typeof block.toolCallId === "string" ? block.toolCallId : undefined) ??
      (typeof block.id === "string" ? block.id : undefined);
    if (!id) {
      continue;
    }
    const resultText = extractTextFromToolResultBlock(block);
    const phase = resolveToolResultPhase(block);
    resultMap.set(id, { result: resultText, phase });

    const toolName =
      (typeof block.name === "string" ? block.name : undefined) ??
      (typeof block.toolName === "string" ? block.toolName : undefined) ??
      (() => {
        const toolCallId =
          (typeof block.toolCallId === "string"
            ? block.toolCallId
            : undefined) ??
          (typeof block.id === "string" ? block.id : undefined);
        if (!toolCallId) {
          return undefined;
        }
        const matchingCall = blocks.find((candidate) => {
          if (!candidate || typeof candidate !== "object") {
            return false;
          }
          const candidateKind = (
            typeof candidate.type === "string" ? candidate.type : ""
          )
            .toLowerCase()
            .replace(/_/g, "");
          if (candidateKind !== "toolcall" && candidateKind !== "tooluse") {
            return false;
          }
          const candidateId =
            (typeof candidate.id === "string" ? candidate.id : undefined) ??
            (typeof candidate.toolCallId === "string"
              ? candidate.toolCallId
              : undefined);
          return candidateId === toolCallId;
        }) as Record<string, unknown> | undefined;
        return typeof matchingCall?.name === "string"
          ? matchingCall.name
          : undefined;
      })();
    if (!isInteractiveToolName(toolName)) {
      continue;
    }
    const interactive = createInteractiveBlock({
      interactiveId: id,
      kind: toolName,
      payload: resultText,
    });
    if (interactive) {
      interactiveMap.set(id, interactive);
    }
  }

  const out: ContentBlock[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const kind = (typeof block.type === "string" ? block.type : "")
      .toLowerCase()
      .replace(/_/g, "");

    if (
      kind === "text" &&
      typeof block.text === "string" &&
      block.text.trim()
    ) {
      out.push({ type: "text", text: block.text });
      continue;
    }

    const isToolCall =
      kind === "toolcall" ||
      kind === "tooluse" ||
      (typeof block.name === "string" && block.arguments != null);
    if (!isToolCall) {
      continue;
    }

    const toolCallId =
      (typeof block.id === "string" ? block.id : undefined) ??
      (typeof block.toolCallId === "string" ? block.toolCallId : undefined) ??
      crypto.randomUUID();
    const toolName =
      (typeof block.name === "string" ? block.name : undefined) ?? "tool";
    const argsRaw = block.arguments ?? block.args;
    let argsText: string | undefined;
    if (typeof argsRaw === "string") {
      argsText = argsRaw;
    } else if (argsRaw != null) {
      try {
        argsText = JSON.stringify(argsRaw, null, 2);
      } catch {
        argsText = undefined;
      }
    }

    const resolved = resultMap.get(toolCallId);
    const interactive = interactiveMap.get(toolCallId);
    if (interactive) {
      out.push(interactive);
      continue;
    }
    out.push({
      type: "tool-call",
      toolCallId,
      toolName,
      argsText,
      result: resolved?.result,
      phase: resolved?.phase ?? "call",
    });
  }

  return out.length > 0 ? out : undefined;
}

