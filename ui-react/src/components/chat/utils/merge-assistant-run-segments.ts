import type { ChatMessage } from "@/components/chat/types";

/**
 * Merge consecutive assistant messages that belong to the same run (same `runId`).
 *
 * This is a deliberately conservative fold:
 * - Only merges *adjacent* assistant rows.
 * - Requires both rows to have the same non-empty `runId`.
 * - Never merges across a user boundary.
 *
 * Primary goal: keep runtime rendering and history reload aligned when the
 * gateway persists a single run across multiple assistant rows.
 */
export function mergeAssistantRunSegments(messages: ChatMessage[]): ChatMessage[] {
  const merged: ChatMessage[] = [];

  for (const message of messages) {
    const last = merged.at(-1);
    const canMerge =
      !!last &&
      last.role === "assistant" &&
      message.role === "assistant" &&
      typeof last.runId === "string" &&
      typeof message.runId === "string" &&
      last.runId.trim().length > 0 &&
      last.runId === message.runId;

    if (!canMerge) {
      merged.push(message);
      continue;
    }

    const mergedContentBlocks = [
      ...(last.contentBlocks ?? []),
      ...(message.contentBlocks ?? []),
    ];
    const mergedText = [last.content, message.content]
      .filter(Boolean)
      .join("\n")
      .trim();

    merged[merged.length - 1] = {
      ...last,
      content: mergedText,
      ts: Math.max(last.ts, message.ts),
      contentBlocks: mergedContentBlocks.length > 0 ? mergedContentBlocks : undefined,
    };
  }

  return merged;
}

