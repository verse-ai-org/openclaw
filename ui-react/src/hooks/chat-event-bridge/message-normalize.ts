import type { ChatMessageRole, MessageAttachment } from "@/store/chat.store";

/**
 * For user messages from chat.history: strip the appended file-content blocks
 * that the gateway injects (starting with "以下是上传文件的内容："),
 * and extract file names from "[文件: filename]" markers.
 *
 * Returns the clean prompt text and a list of attachment display metadata.
 */
export function stripAttachmentContent(raw: string): {
  prompt: string;
  attachments: MessageAttachment[];
} {
  const SEPARATOR = "\n\n以下是上传文件的内容：";
  const idx = raw.indexOf(SEPARATOR);
  if (idx === -1) {
    return { prompt: raw, attachments: [] };
  }

  const prompt = raw.slice(0, idx);
  const attachmentBlock = raw.slice(idx + SEPARATOR.length);

  const fileNameRegex = /\[文件:\s*([^\]]+?)(?:\s*\([^)]*\))?\s*\]/g;
  const attachments: MessageAttachment[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = fileNameRegex.exec(attachmentBlock)) !== null) {
    const fileName = match[1].trim();
    if (fileName && !seen.has(fileName)) {
      seen.add(fileName);
      const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
      const mimeType =
        ext === "pdf"
          ? "application/pdf"
          : ext === "docx" || ext === "doc"
            ? "application/msword"
            : ext === "xlsx" || ext === "xls"
              ? "application/vnd.ms-excel"
              : ext === "png" ||
                  ext === "jpg" ||
                  ext === "jpeg" ||
                  ext === "gif" ||
                  ext === "webp"
                ? `image/${ext}`
                : "text/plain";
      attachments.push({ fileName, mimeType, size: 0 });
    }
  }

  return { prompt, attachments };
}

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
