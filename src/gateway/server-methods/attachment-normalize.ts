import type { ChatAttachment } from "../chat-attachments.js";

export type RpcAttachmentInput = {
  type?: unknown;
  mimeType?: unknown;
  fileName?: unknown;
  content?: unknown;
};

export type RpcAttachmentRefInput = {
  fileId?: unknown;
  path?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  size?: unknown;
  sha256?: unknown;
};

export type ChatAttachmentRef = {
  fileId: string;
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
};

export const ALLOWED_CHAT_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/html",
  "text/csv",
  "application/json",
  "application/xml",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export function normalizeRpcAttachmentsToChatAttachments(
  attachments: RpcAttachmentInput[] | undefined,
): ChatAttachment[] {
  return (
    attachments
      ?.map((a) => ({
        type: typeof a?.type === "string" ? a.type : undefined,
        mimeType: typeof a?.mimeType === "string" ? a.mimeType : undefined,
        fileName: typeof a?.fileName === "string" ? a.fileName : undefined,
        content:
          typeof a?.content === "string"
            ? a.content
            : ArrayBuffer.isView(a?.content)
              ? Buffer.from(a.content.buffer, a.content.byteOffset, a.content.byteLength).toString(
                  "base64",
                )
              : a?.content instanceof ArrayBuffer
                ? Buffer.from(a.content).toString("base64")
                : undefined,
      }))
      .filter((a) => a.content) ?? []
  );
}

export function validateNormalizedChatAttachments(
  attachments: ChatAttachment[],
): { ok: true } | { ok: false; error: string } {
  for (const att of attachments) {
    const mime = typeof att.mimeType === "string" ? att.mimeType.trim().toLowerCase() : "";
    if (!mime) {
      return { ok: false, error: "attachment mimeType is required" };
    }
    if (mime.startsWith("image/")) {
      return { ok: false, error: "image uploads are currently disabled" };
    }
    if (!ALLOWED_CHAT_ATTACHMENT_MIME_TYPES.has(mime)) {
      return { ok: false, error: `unsupported attachment mimeType: ${mime}` };
    }
  }
  return { ok: true };
}

export function normalizeRpcAttachmentRefs(
  refs: RpcAttachmentRefInput[] | undefined,
): ChatAttachmentRef[] {
  if (!refs || refs.length === 0) {
    return [];
  }
  const out: ChatAttachmentRef[] = [];
  for (const raw of refs) {
    const fileId = typeof raw?.fileId === "string" ? raw.fileId.trim() : "";
    const path = typeof raw?.path === "string" ? raw.path.trim() : "";
    if (!fileId || !path) {
      continue;
    }
    out.push({
      fileId,
      path,
      fileName: typeof raw?.fileName === "string" ? raw.fileName.trim() : "",
      mimeType: typeof raw?.mimeType === "string" ? raw.mimeType.trim() : "",
      size: typeof raw?.size === "number" && Number.isFinite(raw.size) ? raw.size : 0,
      sha256: typeof raw?.sha256 === "string" ? raw.sha256.trim() : "",
    });
  }
  return out;
}

export function validateAttachmentRefs(
  refs: ChatAttachmentRef[],
): { ok: true } | { ok: false; error: string } {
  for (const ref of refs) {
    if (!ref.fileId) {
      return { ok: false, error: "attachmentRefs.fileId is required" };
    }
    if (!ref.path) {
      return { ok: false, error: "attachmentRefs.path is required" };
    }
  }
  return { ok: true };
}
