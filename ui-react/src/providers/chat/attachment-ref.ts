import type { AppendMessage, CompleteAttachment } from "@assistant-ui/react";

export type ChatAttachmentRef = {
  fileId: string;
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
};

function toHex(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let out = "";
  for (const b of view) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

async function sha256File(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return toHex(digest);
}

function getElectronFilePath(file: File): string | null {
  const withPath = file as File & { path?: string };
  if (typeof withPath.path === "string" && withPath.path.trim()) {
    return withPath.path.trim();
  }
  return null;
}

export async function buildAttachmentRefsFromMessage(
  message: AppendMessage,
): Promise<{
  refs: ChatAttachmentRef[];
  missingPathFiles: string[];
}> {
  const threadAttachments = (
    message as AppendMessage & { attachments?: readonly CompleteAttachment[] }
  ).attachments;
  if (!threadAttachments || threadAttachments.length === 0) {
    return { refs: [], missingPathFiles: [] };
  }

  const refs: ChatAttachmentRef[] = [];
  const missingPathFiles: string[] = [];

  for (const att of threadAttachments) {
    if (att.status.type !== "complete") {
      continue;
    }
    const file = att.file;
    if (!file) {
      continue;
    }
    const path = getElectronFilePath(file);
    const name = att.name?.trim() || file.name || "file";
    if (!path) {
      missingPathFiles.push(name);
      continue;
    }
    const sha256 = await sha256File(file);
    refs.push({
      fileId: sha256.slice(0, 24),
      path,
      fileName: name,
      mimeType: att.contentType || file.type || "application/octet-stream",
      size: file.size,
      sha256,
    });
  }

  return { refs, missingPathFiles };
}

