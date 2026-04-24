import { type ChatMessage, type MessageAttachment } from "@/store/chat.store";
import {
  consolidateToolMessages,
  extractContentBlocks,
  extractToolCallParts,
  mergeToolResults,
  normalizeContent,
  normalizeHistoryAttachmentHints,
  normalizeRole,
  stripAttachmentContent,
  type RawMessage,
} from "@/hooks/chat-event-bridge";

type HistoryNormalizeHooks = {
  onRawMessages?: (messages: RawMessage[]) => void;
  onNormalizedMessages?: (messages: ChatMessage[]) => void;
  onConsolidatedMessages?: (messages: ChatMessage[]) => void;
};

export function normalizeHistoryMessages(
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
      toolCalls: extractToolCallParts(m.content),
      contentBlocks: extractContentBlocks(m.content),
    };
  });
  hooks?.onNormalizedMessages?.(normalized);

  const consolidated = consolidateToolMessages(normalized);
  hooks?.onConsolidatedMessages?.(consolidated);
  return consolidated;
}
