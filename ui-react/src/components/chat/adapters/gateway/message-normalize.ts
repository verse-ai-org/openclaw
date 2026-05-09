import type { ChatMessageRole, MessageAttachment } from "@/components/chat/types";

/** Prefer gateway-provided attachment hints (after server-side content shortening). */
export function normalizeHistoryAttachmentHints(raw: unknown): MessageAttachment[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }
  const out: MessageAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const o = item as Record<string, unknown>;
    const fileName =
      typeof o.fileName === "string"
        ? o.fileName
        : typeof o.name === "string"
          ? o.name
          : "";
    if (!fileName.trim()) {
      continue;
    }
    const mimeType =
      typeof o.mimeType === "string" && o.mimeType.trim() ? o.mimeType : "application/octet-stream";
    const size = typeof o.size === "number" && Number.isFinite(o.size) ? o.size : 0;
    out.push({ fileName: fileName.trim(), mimeType, size });
  }
  return out.length > 0 ? out : undefined;
}

/** Normalize a raw message content field to a plain string. */
export function normalizeContent(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }
  if (Array.isArray(raw)) {
    return raw
      .map((block) => {
        if (!block || typeof block !== "object") {
          return "";
        }
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") {
          return b.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/**
 * Normalize a raw Gateway message role to one of the two roles
 * that assistant-ui supports: "user" | "assistant".
 */
export function normalizeRole(raw: string | undefined): ChatMessageRole {
  const lower = (raw ?? "").toLowerCase().replace(/_/g, "");
  switch (lower) {
    case "user":
      return "user";
    default:
      return "assistant";
  }
}

/**
 * Plain text from a `chat` WS payload `message` object (delta / final).
 * Text parts in `content[]` are concatenated with **no** separator — matches
 * streaming cumulative assistant strings from the gateway.
 */
export function extractGatewayChatMessageText(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  const m = message as Record<string, unknown>;
  if (typeof m.text === "string") {
    return m.text;
  }
  if (Array.isArray(m.content)) {
    return (m.content as unknown[])
      .filter(
        (b): b is { type: "text"; text: string } =>
          !!b &&
          typeof b === "object" &&
          (b as Record<string, unknown>).type === "text" &&
          typeof (b as Record<string, unknown>).text === "string",
      )
      .map((b) => b.text)
      .join("");
  }
  if (typeof m.content === "string") {
    return m.content;
  }
  return "";
}

/** Extract plain text from a Gateway message object (content string or content block array). */
export function extractMessageText(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  const m = message as Record<string, unknown>;
  if (typeof m.text === "string") {
    return m.text;
  }
  return normalizeContent(m.content);
}

