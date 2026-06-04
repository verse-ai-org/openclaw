import type { MessageAttachment } from "@/components/chat/types";

/**
 * History-only compatibility: the gateway may append a file-content section to user messages.
 * We strip that injected block and extract attachment display metadata from the markers.
 *
 * @deprecated Prefer gateway `artifactRefs` on history rows; kept for legacy appendix-only rows.
 */
export function stripAttachmentContent(raw: string): {
  prompt: string;
  attachments: MessageAttachment[];
} {
  const separators = [
    "\n\nUploaded file contents:",
    "\n\nthe content of the uploaded files:",
  ];
  let idx = -1;
  let sepLen = 0;
  for (const sep of separators) {
    const found = raw.indexOf(sep);
    if (found !== -1 && (idx === -1 || found < idx)) {
      idx = found;
      sepLen = sep.length;
    }
  }
  if (idx === -1) {
    return { prompt: raw, attachments: [] };
  }

  const prompt = raw.slice(0, idx);
  const attachmentBlock = raw.slice(idx + sepLen);

  const fileNameRegex = /\[(?:File|文件):\s*([^\]]+?)(?:\s*\([^)]*\))?\s*\]/gi;
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

