import type { AppendMessage, CompleteAttachment } from "@assistant-ui/react";
import type { MessageAttachment } from "@/store/chat.store";

type GatewayAttachment = { content: string; mimeType: string; fileName: string };

export type ParsedGatewaySendPayload = {
  text: string;
  gatewayAttachments: GatewayAttachment[];
  displayAttachments: MessageAttachment[];
};

export function parseGatewaySendPayload(
  message: AppendMessage,
): ParsedGatewaySendPayload {
  const textChunks: string[] = [];
  const displayAttachments: MessageAttachment[] = [];

  const consumePart = (
    part:
      | { type: "text"; text: string }
      | { type: "file"; data: string; mimeType: string; filename?: string },
    meta?: Pick<CompleteAttachment, "name" | "contentType" | "file">,
  ) => {
    if (part.type === "text") {
      textChunks.push(part.text);
      return;
    }
    const fileName = part.filename ?? meta?.name ?? "file";
    const mimeType = part.mimeType || meta?.contentType || "application/octet-stream";
    displayAttachments.push({
      fileName,
      mimeType,
      size: meta?.file?.size ?? 0,
    });
  };

  const raw = message.content;
  const contentParts = typeof raw === "string" ? [{ type: "text" as const, text: raw }] : [...raw];
  for (const part of contentParts) {
    if (part.type === "text" || part.type === "file") {
      consumePart(part, undefined);
    }
  }

  const threadAttachments = (
    message as AppendMessage & { attachments?: readonly CompleteAttachment[] }
  ).attachments;
  if (threadAttachments && threadAttachments.length > 0) {
    for (const att of threadAttachments) {
      if (att.status.type !== "complete") {
        continue;
      }
      const meta = {
        name: att.name,
        contentType: att.contentType,
        file: att.file,
      };
      for (const part of att.content) {
        if (part.type === "text" || part.type === "file") {
          consumePart(part, meta);
        }
      }
    }
  }

  return {
    text: textChunks.join("\n"),
    gatewayAttachments: [] satisfies GatewayAttachment[],
    displayAttachments,
  };
}
