import type { ChatMessage, MessageAttachment } from "@/components/chat/types";
import {
  extractContentBlocks,
  mergeToolResults,
  normalizeContent,
  normalizeHistoryAttachmentHints,
  normalizeRole,
  stripAttachmentContent,
  type RawMessage,
} from "@/components/chat/gateway";
import { mergeAssistantRunSegments } from "@/components/chat/messages/inbound/merge-assistant-run-segments";

type HistoryNormalizeHooks = {
  onRawMessages?: (messages: RawMessage[]) => void;
  onNormalizedMessages?: (messages: ChatMessage[]) => void;
  onConsolidatedMessages?: (messages: ChatMessage[]) => void;
};

/**
 * Turn gateway `chat.history` rows into UI {@link ChatMessage} list (single entry point).
 *
 * Stages (order matters):
 * 1. `onRawMessages` hook — observe the unmodified gateway array.
 * 2. **mergeToolResults** — fold gateway tool-related rows into conversational shape.
 * 3. **Per-row map** — {@link normalizeRole}; flatten body via {@link normalizeContent};
 *    user rows: {@link stripAttachmentContent} + {@link normalizeHistoryAttachmentHints};
 *    assistant rows: {@link extractContentBlocks} from raw `content`.
 * 4. `onNormalizedMessages` hook — one ChatMessage per logical row before run folding.
 * 5. **mergeAssistantRunSegments** — merge adjacent assistant rows with the same non-empty `runId`.
 * 6. `onConsolidatedMessages` hook — final list passed to the store / thread runtime.
 */
export function consolidateHistoryMessages(
  messages: RawMessage[],
  sessionKey: string | undefined,
  hooks?: HistoryNormalizeHooks,
): ChatMessage[] {
  hooks?.onRawMessages?.(messages);

  const merged = mergeToolResults(messages) as RawMessage[];

  const normalized: ChatMessage[] = merged.map((m) => {
    const role = normalizeRole(m.role);
    const rawContent = normalizeContent(m.content ?? m.text ?? "");

    let content = rawContent;
    let attachments: MessageAttachment[] | undefined;
    if (role === "user") {
      const fromGateway = normalizeHistoryAttachmentHints(m.attachments);
      const stripped = stripAttachmentContent(rawContent);
      content = stripped.prompt;
      attachments =
        fromGateway ??
        (stripped.attachments.length > 0 ? stripped.attachments : undefined);
    }

    return {
      id: m.id ?? crypto.randomUUID(),
      role,
      content,
      ts: m.ts ?? m.timestamp ?? Date.now(),
      runId: m.runId,
      sessionKey,
      attachments,
      metadata:
        m.metadata && typeof m.metadata === "object"
          ? (m.metadata as ChatMessage["metadata"])
          : undefined,
      contentBlocks: extractContentBlocks(m.content),
    };
  });
  hooks?.onNormalizedMessages?.(normalized);

  const mergedSegments = mergeAssistantRunSegments(normalized);
  hooks?.onConsolidatedMessages?.(mergedSegments);
  return mergedSegments;
}

/**
 * Alias for {@link consolidateHistoryMessages} — kept so existing imports keep working.
 */
export const normalizeHistoryMessages = consolidateHistoryMessages;
