import type { AttachmentAdapter, CompleteAttachment, PendingAttachment } from "@assistant-ui/react";
import { CompositeAttachmentAdapter } from "@assistant-ui/react";
import { toast } from "sonner";
import { fileToBase64 } from "@/utils/file-to-base64";

export const ALLOWED_MIME_TYPES = new Set([
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
  "application/zip",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",
  "audio/webm",
]);

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB per image
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB per file (base64 mode)
export const MAX_ATTACHMENT_COUNT = 10;
export const MAX_FILE_SIZE_BYTES_REFERENCE_MODE = 100 * 1024 * 1024; // 100MB per file (Electron ref mode)

const ALLOWED_FILE_MIME_LIST = [...ALLOWED_MIME_TYPES].join(",");

class GatewayImageAttachmentAdapter implements AttachmentAdapter {
  accept = "image/*";

  async add(state: { file: File }): Promise<PendingAttachment> {
    const { file } = state;
    if (!file.type.startsWith("image/")) {
      throw new Error("Only images accepted by this adapter");
    }
    if (file.size <= 0) {
      const msg = `Empty file: ${file.name}`;
      toast.error(msg, { duration: 3000 });
      throw new Error(msg);
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      const msg = `图片过大: ${file.name}，最大支持 ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB`;
      toast.error(msg, { duration: 3000 });
      throw new Error(msg);
    }
    return {
      id: crypto.randomUUID(),
      type: "image",
      name: file.name,
      contentType: file.type,
      file,
      status: { type: "requires-action", reason: "composer-send" },
    };
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    const base64 = await fileToBase64(attachment.file);
    return {
      ...attachment,
      status: { type: "complete" },
      content: [
        {
          type: "image",
          image: base64,
        },
      ],
    };
  }

  async remove(): Promise<void> {}
}

class GatewayBinaryAttachmentAdapter implements AttachmentAdapter {
  accept = ALLOWED_FILE_MIME_LIST;

  async add(state: { file: File }): Promise<PendingAttachment> {
    const { file } = state;
    if (file.type.startsWith("image/")) {
      throw new Error("Images handled by GatewayImageAttachmentAdapter");
    }
    if (file.size <= 0) {
      const msg = `Empty file: ${file.name}`;
      toast.error(msg, { duration: 3000 });
      throw new Error(msg);
    }
    if (file.size > MAX_FILE_SIZE_BYTES_REFERENCE_MODE) {
      const msg = `文件过大: ${file.name}，最大支持 100MB`;
      toast.error(msg, { duration: 3000 });
      throw new Error(msg);
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      const msg = `不支持的文件类型: ${file.name} (${file.type || "unknown"})`;
      toast.error(msg, { duration: 3000 });
      throw new Error(msg);
    }
    return {
      id: crypto.randomUUID(),
      type: "file",
      name: file.name,
      contentType: file.type,
      file,
      status: { type: "requires-action", reason: "composer-send" },
    };
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    return {
      ...attachment,
      status: { type: "complete" },
      content: [
        {
          type: "file",
          data: "",
          mimeType: attachment.file.type,
          filename: attachment.name,
        },
      ],
    };
  }

  async remove(): Promise<void> {}
}

export function createGatewayCompositeAttachmentAdapter(): CompositeAttachmentAdapter {
  return new CompositeAttachmentAdapter([
    new GatewayImageAttachmentAdapter(),
    new GatewayBinaryAttachmentAdapter(),
  ]);
}

