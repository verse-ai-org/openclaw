import { sliceStreamAfterCommittedAssistant } from "@/providers/chat/committed-stream-prefix";
import {
  toolStreamEntryToResultText,
  type ChatMessage,
  type ContentBlock,
  type InteractiveContentBlock,
  type ToolStreamEntry,
} from "@/store/chat.store";
import type { RunProjectionState } from "./types";

function liveStreamTextAfterCommits(
  streamContent: string,
  committedBlocks: ContentBlock[],
): string {
  return sliceStreamAfterCommittedAssistant(streamContent, committedBlocks);
}

export function mergeAssistantRunMessages(messages: ChatMessage[]): ChatMessage[] {
  const merged: ChatMessage[] = [];
  for (const message of messages) {
    if (message.role !== "assistant" || !message.runId) {
      merged.push(message);
      continue;
    }
    const last = merged.at(-1);
    const canMergeWithLast =
      !!last &&
      last.role === "assistant" &&
      !!last.runId &&
      last.runId === message.runId;
    if (!canMergeWithLast) {
      merged.push(message);
      continue;
    }
    const mergedContentBlocks = [
      ...(last.contentBlocks ?? []),
      ...(message.contentBlocks ?? []),
    ];
    const mergedToolCalls = [...(last.toolCalls ?? []), ...(message.toolCalls ?? [])];
    const mergedText = [last.content, message.content].filter(Boolean).join("\n").trim();
    merged[merged.length - 1] = {
      ...last,
      content: mergedText,
      ts: Math.max(last.ts, message.ts),
      contentBlocks: mergedContentBlocks.length > 0 ? mergedContentBlocks : undefined,
      toolCalls: mergedToolCalls.length > 0 ? mergedToolCalls : undefined,
    };
  }
  return merged;
}

export type SelectThreadMessagesParams = {
  chatMessages: ChatMessage[];
  isRunning: boolean;
  liveCumulativeText: string | null;
  committedBlocks: ContentBlock[];
  toolStreamById: Map<string, ToolStreamEntry>;
  toolStreamOrder: string[];
  interactiveStreamById: Map<string, InteractiveContentBlock>;
  interactiveStreamOrder: string[];
  effectiveRunId: string | null;
};

/**
 * Builds assistant-ui runtime messages including synthetic `__stream__` while a
 * run is active — same output shape as the former `buildRuntimeMessages`.
 */
export function selectThreadMessages(params: SelectThreadMessagesParams): ChatMessage[] {
  const {
    chatMessages,
    isRunning,
    liveCumulativeText,
    committedBlocks,
    toolStreamById,
    toolStreamOrder,
    interactiveStreamById,
    interactiveStreamOrder,
    effectiveRunId,
  } = params;
  const mergedMessages = mergeAssistantRunMessages(chatMessages);
  if (!isRunning) {
    return mergedMessages;
  }

  const contentBlocks: ContentBlock[] = [...committedBlocks];
  for (const id of interactiveStreamOrder) {
    const entry = interactiveStreamById.get(id);
    if (!entry) {
      continue;
    }
    contentBlocks.push(entry);
  }
  for (const id of toolStreamOrder) {
    const entry = toolStreamById.get(id);
    if (!entry) {
      continue;
    }
    contentBlocks.push({
      type: "tool-call",
      toolCallId: entry.id,
      toolName: entry.toolName ?? "tool",
      argsText: entry.input != null ? JSON.stringify(entry.input, null, 2) : undefined,
      result: toolStreamEntryToResultText(entry),
      phase: entry.phase === "result" ? "result" : entry.phase === "error" ? "error" : "call",
    });
  }

  const streamContent = liveCumulativeText ?? "";
  const streamTail = liveStreamTextAfterCommits(streamContent, committedBlocks);
  if (streamTail.trim()) {
    contentBlocks.push({ type: "text", text: streamTail });
  }
  if (contentBlocks.length === 0 && isRunning) {
    contentBlocks.push({ type: "text", text: "" });
  }

  const liveToolCalls = toolStreamOrder
    .map((id) => toolStreamById.get(id))
    .filter(Boolean)
    .map((entry) => ({
      toolCallId: entry!.id,
      toolName: entry!.toolName ?? "tool",
      argsText: entry!.input != null ? JSON.stringify(entry!.input, null, 2) : undefined,
      result: toolStreamEntryToResultText(entry!),
      error: entry!.error,
      phase: (entry!.phase === "result"
        ? "result"
        : entry!.phase === "error"
          ? "error"
          : "call") as "call" | "result" | "error",
    }));

  return [
    ...mergedMessages,
    {
      id: "__stream__",
      role: "assistant" as const,
      content: streamContent,
      ts: Date.now(),
      runId: effectiveRunId ?? undefined,
      toolCalls: liveToolCalls.length > 0 ? liveToolCalls : undefined,
      contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
    },
  ];
}

function toToolCallBlockPhase(
  phase: "start" | "running" | "result" | "error",
): "call" | "result" | "error" {
  if (phase === "result") {
    return "result";
  }
  if (phase === "error") {
    return "error";
  }
  return "call";
}

/** True when lifecycle/chat final should merge buffered assistant output. */
export function hasBufferedAssistantProjection(state: RunProjectionState): boolean {
  return (
    state.liveCumulativeText !== null ||
    state.committedBlocks.length > 0 ||
    state.toolStreamOrder.length > 0 ||
    state.interactiveStreamOrder.length > 0
  );
}

/** Same merge order as former `finalizeStream` / `buildFinalAssistantMessage`. */
export function buildFinalAssistantMessageFromProjection(params: {
  projection: RunProjectionState;
  text: string;
  runId?: string;
  nowMs?: number;
}): ChatMessage {
  const now = params.nowMs ?? Date.now();
  const {
    committedBlocks,
    toolStreamById,
    toolStreamOrder,
    interactiveStreamById,
    interactiveStreamOrder,
  } = params.projection;

  const hasToolCalls = toolStreamOrder.length > 0;
  const hasInteractive = interactiveStreamOrder.length > 0;
  const hasCommitted = committedBlocks.length > 0;

  if (!hasToolCalls && !hasInteractive && !hasCommitted) {
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      content: params.text,
      ts: now,
      runId: params.runId,
    };
  }

  const contentBlocks: ContentBlock[] = [...committedBlocks];
  for (const id of interactiveStreamOrder) {
    const entry = interactiveStreamById.get(id);
    if (!entry) {
      continue;
    }
    contentBlocks.push(entry);
  }
  for (const id of toolStreamOrder) {
    const entry = toolStreamById.get(id);
    if (!entry) {
      continue;
    }
    contentBlocks.push({
      type: "tool-call",
      toolCallId: entry.id,
      toolName: entry.toolName ?? "tool",
      argsText:
        entry.input != null ? JSON.stringify(entry.input, null, 2) : undefined,
      result: toolStreamEntryToResultText(entry),
      phase: toToolCallBlockPhase(entry.phase),
    });
  }
  if (params.text.trim()) {
    contentBlocks.push({ type: "text", text: params.text });
  }

  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: params.text,
    ts: now,
    runId: params.runId,
    contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
  };
}

/**
 * When `chat` final has no `message.text`, persist buffered projection (former
 * `finalizeStream`).
 */
export function finalizeProjectionToAssistantMessage(
  projection: RunProjectionState,
  runId: string | null,
): ChatMessage | null {
  const {
    liveCumulativeText: stream,
    committedBlocks,
    toolStreamById,
    toolStreamOrder,
    interactiveStreamById,
    interactiveStreamOrder,
  } = projection;

  const contentBlocks: ContentBlock[] = [...committedBlocks];

  for (const id of interactiveStreamOrder) {
    const entry = interactiveStreamById.get(id);
    if (!entry) {
      continue;
    }
    contentBlocks.push(entry);
  }

  for (const id of toolStreamOrder) {
    const entry = toolStreamById.get(id);
    if (!entry) {
      continue;
    }
    contentBlocks.push({
      type: "tool-call",
      toolCallId: entry.id,
      toolName: entry.toolName ?? "tool",
      argsText:
        entry.input != null ? JSON.stringify(entry.input, null, 2) : undefined,
      result: toolStreamEntryToResultText(entry),
      phase:
        entry.phase === "result"
          ? "result"
          : entry.phase === "error"
            ? "error"
            : "call",
    });
  }

  if (stream && stream.trim()) {
    contentBlocks.push({ type: "text", text: stream });
  }

  if (contentBlocks.length === 0 && !stream) {
    return null;
  }

  const flatText = contentBlocks
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: flatText,
    ts: Date.now(),
    runId: runId ?? undefined,
    contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
  };
}
