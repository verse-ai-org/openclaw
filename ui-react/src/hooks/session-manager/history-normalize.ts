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

function extractInteractionResumeDisplayText(content: string): string | null {
  const match = content.match(/<interaction_resume>\s*([\s\S]*?)\s*<\/interaction_resume>/i);
  if (!match) {
    return null;
  }
  const body = match[1]?.trim();
  if (!body) {
    return "";
  }
  try {
    const parsed = JSON.parse(body) as {
      payload?: { displayText?: unknown; summary?: unknown };
    };
    const displayText = parsed.payload?.displayText;
    if (typeof displayText === "string") {
      return displayText.trim();
    }
    const summary = parsed.payload?.summary;
    if (Array.isArray(summary)) {
      const lines = summary
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }
          const question = (entry as { question?: unknown }).question;
          const answer = (entry as { answer?: unknown }).answer;
          if (typeof question !== "string" || typeof answer !== "string") {
            return null;
          }
          return `${question}：${answer}`;
        })
        .filter((line): line is string => Boolean(line));
      if (lines.length > 0) {
        return lines.join("\n");
      }
    }
  } catch {
    return "";
  }
  return "";
}

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
    const interactionResumeDisplay = extractInteractionResumeDisplayText(rawContent);

    let content = rawContent;
    let attachments: MessageAttachment[] | undefined;
    if (role === "user") {
      if (interactionResumeDisplay !== null) {
        content = interactionResumeDisplay;
      }
      const fromGateway = normalizeHistoryAttachmentHints(m.attachments);
      const stripped = stripAttachmentContent(content);
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
      toolCalls: extractToolCallParts(m.content),
      contentBlocks: extractContentBlocks(m.content),
    };
  });
  const filtered = normalized.filter((m) => {
    if (m.role !== "user") {
      return true;
    }
    if (m.content.trim().length > 0) {
      return true;
    }
    return Boolean(m.attachments && m.attachments.length > 0);
  });
  hooks?.onNormalizedMessages?.(filtered);

  const consolidated = consolidateToolMessages(filtered);
  hooks?.onConsolidatedMessages?.(consolidated);
  return consolidated;
}
