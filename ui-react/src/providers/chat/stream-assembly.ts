import {
  type ChatMessage,
  type ContentBlock,
  toolStreamEntryToResultText,
  type InteractionState,
  type InteractiveContentBlock,
  type ToolStreamEntry,
} from "@/store/chat.store";
import { splitAskTags } from "./ask-tag-split";

type BuildRuntimeMessagesParams = {
  chatMessages: ChatMessage[];
  isRunning: boolean;
  stream: string | null;
  committedBlocks: ContentBlock[];
  toolStreamById: Map<string, ToolStreamEntry>;
  toolStreamOrder: string[];
  interactiveStreamById: Map<string, InteractiveContentBlock>;
  interactiveStreamOrder: string[];
  /**
   * Live interactions keyed by `interactionId`. Entries without a `messageId`
   * are still attached to the streaming assistant turn and must show up as
   * content parts on the `__stream__` message for ordering; once the turn
   * finalizes these get moved onto the persisted assistant message.
   */
  interactions?: Record<string, InteractionState>;
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
    interactions,
    effectiveRunId,
  } = params;
  const mergedMessages = mergeAssistantRunMessages(chatMessages);
  if (!isRunning) {
    return mergedMessages;
  }

  // Resolve pending interactions up-front (keyed by interactionId). Any id
  // referenced from the in-flight `stream` or already-committed blocks will
  // be consumed from here; anything left over at the end gets appended as
  // "floating" interactions (e.g. events we received before the `<ask>` tag
  // arrived in the stream text).
  const pendingInteractionsById = new Map<string, InteractionState>();
  if (interactions) {
    for (const i of Object.values(interactions)) {
      if (!i.messageId) pendingInteractionsById.set(i.interactionId, i);
    }
  }
  const takeInteraction = (id: string): boolean => {
    if (!pendingInteractionsById.has(id)) return false;
    pendingInteractionsById.delete(id);
    return true;
  };

  // Helper: emit a text block, first hoisting any `<ask>` tags in-line into
  // interaction parts so raw tag markup never reaches the markdown renderer.
  // The interaction part is pushed even if the matching `interactions` entry
  // hasn't landed yet — InteractiveParts renders nothing for an unknown id,
  // which is preferable to briefly showing raw XML.
  const emitTextWithAskSplit = (blocks: ContentBlock[], text: string) => {
    if (!text) return;
    for (const piece of splitAskTags(text, { hideUnclosed: true })) {
      if (piece.kind === "interaction") {
        takeInteraction(piece.interactionId);
        blocks.push({ type: "interaction", interactionId: piece.interactionId });
      } else if (piece.text.length > 0) {
        blocks.push({ type: "text", text: piece.text });
      }
    }
  };

  const contentBlocks: ContentBlock[] = [];
  // Replay committed blocks, but run text blocks through the <ask> splitter
  // so already-frozen prose that contains a tag still gets hoisted into an
  // interaction part at the correct position.
  for (const block of committedBlocks) {
    if (block.type === "text") {
      emitTextWithAskSplit(contentBlocks, block.text);
    } else if (block.type === "interaction") {
      takeInteraction(block.interactionId);
      contentBlocks.push(block);
    } else {
      contentBlocks.push(block);
    }
  }
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
    emitTextWithAskSplit(contentBlocks, streamContent);
  }

  // Any pending interaction we haven't already placed in-stream gets appended
  // at the end, ordered by createdAt. This covers the race where the
  // `<ask>` tag JSON body hasn't finished streaming yet (so the tag isn't
  // closed in `stream`) but the interaction agent-event has already arrived.
  if (pendingInteractionsById.size > 0) {
    const pending = Array.from(pendingInteractionsById.values()).sort(
      (a, b) => a.createdAt - b.createdAt,
    );
    for (const i of pending) {
      contentBlocks.push({ type: "interaction", interactionId: i.interactionId });
    }
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
