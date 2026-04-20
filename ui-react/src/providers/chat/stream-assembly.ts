import {
  type ChatMessage,
  type ContentBlock,
  toolStreamEntryToResultText,
  type InteractiveContentBlock,
  type ToolStreamEntry,
} from "@/store/chat.store";

type BuildRuntimeMessagesParams = {
  chatMessages: ChatMessage[];
  isRunning: boolean;
  stream: string | null;
  committedBlocks: ContentBlock[];
  toolStreamById: Map<string, ToolStreamEntry>;
  toolStreamOrder: string[];
  interactiveStreamById: Map<string, InteractiveContentBlock>;
  interactiveStreamOrder: string[];
  effectiveRunId: string | null;
};

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

export function buildRuntimeMessages(params: BuildRuntimeMessagesParams): ChatMessage[] {
  const {
    chatMessages,
    isRunning,
    stream,
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
    if (!entry) continue;
    contentBlocks.push(entry);
  }
  for (const id of toolStreamOrder) {
    const entry = toolStreamById.get(id);
    if (!entry) continue;
    contentBlocks.push({
      type: "tool-call",
      toolCallId: entry.id,
      toolName: entry.toolName ?? "tool",
      argsText: entry.input != null ? JSON.stringify(entry.input, null, 2) : undefined,
      result: toolStreamEntryToResultText(entry),
      phase: entry.phase === "result" ? "result" : entry.phase === "error" ? "error" : "call",
    });
  }

  const streamContent = stream ?? "";
  if (streamContent.trim()) {
    contentBlocks.push({ type: "text", text: streamContent });
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
