import type {
  ChatMessage,
  ContentBlock,
  ToolCallPart,
  InteractiveContentBlock,
} from "@/store/chat.store";
import { isInteractiveToolName, createInteractiveBlock } from "./interactive-blocks";

/**
 * Merge consecutive tool-call-only assistant ChatMessages into one.
 */
export function consolidateToolMessages(messages: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    if (msg.role !== "assistant") {
      result.push(msg);
      i++;
      continue;
    }

    const blocks = msg.contentBlocks;
    const isToolOnly =
      blocks &&
      blocks.length > 0 &&
      blocks.every((b) => b.type === "tool-call");

    if (!isToolOnly) {
      result.push(msg);
      i++;
      continue;
    }

    const groupBlocks: ContentBlock[] = [...blocks];
    let j = i + 1;
    while (j < messages.length) {
      const next = messages[j];
      if (next.role !== "assistant") {
        break;
      }
      const nb = next.contentBlocks;
      if (!nb || nb.length === 0 || !nb.every((b) => b.type === "tool-call")) {
        break;
      }
      groupBlocks.push(...nb);
      j++;
    }

    result.push({ ...msg, contentBlocks: groupBlocks });
    i = j;
  }

  return result;
}

function extractTextFromToolResultBlock(block: Record<string, unknown>): string | undefined {
  if (typeof block.text === "string") {
    return block.text;
  }
  if (typeof block.content === "string") {
    return block.content;
  }
  if (Array.isArray(block.content)) {
    return (block.content as Array<Record<string, unknown>>)
      .filter((b) => (b.type as string) === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("");
  }
  return undefined;
}

/** Error UI follows server/toolResult `isError` only — no client-side inference. */
function resolveToolResultPhase(block: Record<string, unknown>): "result" | "error" {
  return block.isError === true ? "error" : "result";
}

/**
 * Pre-process a raw Gateway history message array:
 * merge standalone toolResult messages into the preceding assistant message's
 * content array, then filter out the toolResult messages.
 */
export function mergeToolResults(rawMessages: unknown[]): unknown[] {
  const out: Record<string, unknown>[] = [];

  for (const raw of rawMessages) {
    const msg = raw as Record<string, unknown>;
    const roleStr = ((msg.role as string) ?? "")
      .toLowerCase()
      .replace(/_/g, "");

    if (roleStr === "toolresult" || roleStr === "tool") {
      for (let i = out.length - 1; i >= 0; i--) {
        const prev = out[i];
        const prevRole = ((prev.role as string) ?? "")
          .toLowerCase()
          .replace(/_/g, "");
        if (prevRole === "toolresult" || prevRole === "tool") {
          continue;
        }
        const prevContent = Array.isArray(prev.content)
          ? (prev.content as Array<Record<string, unknown>>)
          : [];
        const pairedIds = new Set(
          prevContent
            .filter((b) => (b.type as string) === "toolresult")
            .map((b) => b.toolCallId as string)
            .filter(Boolean),
        );
        const unpaired = prevContent.find(
          (b) =>
            (b.type as string) === "toolCall" &&
            typeof b.id === "string" &&
            !pairedIds.has(b.id),
        );
        const toolCallId = unpaired?.id as string | undefined;

        const rawContent = Array.isArray(msg.content)
          ? (msg.content as Array<Record<string, unknown>>)
          : [];
        const resultText = rawContent
          .filter((b) => (b.type as string) === "text" && typeof b.text === "string")
          .map((b) => b.text as string)
          .join("");
        const resultBlock: Record<string, unknown> = {
          type: "toolresult",
          text: resultText,
          ...(toolCallId ? { toolCallId } : {}),
        };
        if (typeof msg.isError === "boolean") {
          resultBlock.isError = msg.isError;
        }

        out[i] = { ...prev, content: [...prevContent, resultBlock] };
        break;
      }
    } else {
      out.push({ ...msg });
    }
  }

  return out;
}

/**
 * Extract tool call parts from a raw message's content array.
 */
export function extractToolCallParts(rawContent: unknown): ToolCallPart[] {
  if (!Array.isArray(rawContent)) {
    return [];
  }

  const blocks = rawContent as Array<Record<string, unknown>>;
  const parts: ToolCallPart[] = [];

  for (const block of blocks) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const kind = (typeof block.type === "string" ? block.type : "")
      .toLowerCase()
      .replace(/_/g, "");
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
    const toolName = (typeof block.name === "string" ? block.name : undefined) ?? "tool";
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
    parts.push({ toolCallId, toolName, argsText, phase: "call" });
  }

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

    const toolCallId =
      (typeof block.toolCallId === "string" ? block.toolCallId : undefined) ??
      (typeof block.id === "string" ? block.id : undefined);
    const resultText = extractTextFromToolResultBlock(block);
    const resPhase = resolveToolResultPhase(block);

    const existing = toolCallId ? parts.find((p) => p.toolCallId === toolCallId) : null;
    if (existing) {
      existing.result = resultText;
      existing.phase = resPhase;
    } else {
      const toolName =
        (typeof block.name === "string" ? block.name : undefined) ??
        (typeof block.toolName === "string" ? block.toolName : undefined) ??
        "tool";
      parts.push({
        toolCallId: toolCallId ?? crypto.randomUUID(),
        toolName,
        result: resultText,
        phase: resPhase,
      });
    }
  }

  return parts;
}

/**
 * Extract ordered ContentBlocks (text + tool-call) from a raw message content array.
 */
export function extractContentBlocks(rawContent: unknown): ContentBlock[] | undefined {
  if (!Array.isArray(rawContent)) {
    return undefined;
  }

  const blocks = rawContent as Array<Record<string, unknown>>;

  const resultMap = new Map<string, { result?: string; phase: "result" | "error" }>();
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
          (typeof block.toolCallId === "string" ? block.toolCallId : undefined) ??
          (typeof block.id === "string" ? block.id : undefined);
        if (!toolCallId) {
          return undefined;
        }
        const matchingCall = blocks.find((candidate) => {
          if (!candidate || typeof candidate !== "object") {
            return false;
          }
          const candidateKind = (typeof candidate.type === "string" ? candidate.type : "")
            .toLowerCase()
            .replace(/_/g, "");
          if (candidateKind !== "toolcall" && candidateKind !== "tooluse") {
            return false;
          }
          const candidateId =
            (typeof candidate.id === "string" ? candidate.id : undefined) ??
            (typeof candidate.toolCallId === "string" ? candidate.toolCallId : undefined);
          return candidateId === toolCallId;
        }) as Record<string, unknown> | undefined;
        return typeof matchingCall?.name === "string" ? matchingCall.name : undefined;
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

    if (kind === "text" && typeof block.text === "string" && block.text.trim()) {
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
    const toolName = (typeof block.name === "string" ? block.name : undefined) ?? "tool";
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
