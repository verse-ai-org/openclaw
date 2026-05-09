import type { MessageAttachment } from "@/components/chat/types";

/**
 * History-only compatibility: the gateway may append a file-content section to user messages.
 * We strip that injected block and extract attachment display metadata from the markers.
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

