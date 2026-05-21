import type { ChatMessage } from "@/components/chat/types";
import { sanitizeExportFilenameSegment } from "./resolve-assistant-display-name";

function extractMessageText(message: ChatMessage): string {
  const blocks = message.contentBlocks;
  if (blocks && blocks.length > 0) {
    const parts: string[] = [];
    for (const block of blocks) {
      if (block.type === "text" && block.text.trim()) {
        parts.push(block.text.trim());
      }
    }
    if (parts.length > 0) {
      return parts.join("\n\n");
    }
  }
  return message.content.trim();
}

function formatAttachmentNote(message: ChatMessage): string {
  const attachments = message.attachments;
  if (!attachments?.length) {
    return "";
  }
  const names = attachments.map((a) => a.fileName).join(", ");
  return `[Attachments: ${names}]`;
}

export function buildChatMarkdown(
  messages: ChatMessage[],
  assistantName: string,
): string | null {
  if (messages.length === 0) {
    return null;
  }
  const lines: string[] = [`# Chat with ${assistantName}`, ""];
  for (const msg of messages) {
    const roleLabel =
      msg.role === "user" ? "You" : msg.role === "assistant" ? assistantName : "Message";
    const ts = Number.isFinite(msg.ts) ? new Date(msg.ts).toISOString() : "";
    const text = extractMessageText(msg);
    const attachmentNote = formatAttachmentNote(msg);
    const body = [text, attachmentNote].filter(Boolean).join("\n\n");
    if (!body.trim()) {
      continue;
    }
    lines.push(`## ${roleLabel}${ts ? ` (${ts})` : ""}`, "", body, "");
  }
  if (lines.length <= 2) {
    return null;
  }
  return lines.join("\n");
}

export function exportChatMarkdown(messages: ChatMessage[], assistantName: string): boolean {
  const markdown = buildChatMarkdown(messages, assistantName);
  if (!markdown) {
    return false;
  }
  const safeName = sanitizeExportFilenameSegment(assistantName);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `chat-${safeName}-${Date.now()}.md`;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}
