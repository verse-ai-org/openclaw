import type {
  AttachmentAdapter,
  CompleteAttachment,
  PendingAttachment,
} from "@assistant-ui/react";
import {
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
} from "@assistant-ui/react";

export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
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

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file
const NON_IMAGE_MIME_TYPES = [...ALLOWED_MIME_TYPES].filter((m) => !m.startsWith("image/"));

function fileToBase64Raw(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? result);
    });
    reader.addEventListener("error", () => {
      reject(reader.error);
    });
    reader.readAsDataURL(file);
  });
}

class GatewayBinaryAttachmentAdapter implements AttachmentAdapter {
  accept = NON_IMAGE_MIME_TYPES.join(",");

  async add(state: { file: File }): Promise<PendingAttachment> {
    const { file } = state;
    if (file.size > MAX_FILE_SIZE) {
      throw new Error("File exceeds 5 MB limit");
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      throw new Error("File type is not supported");
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
    const base64 = await fileToBase64Raw(attachment.file);
    return {
      ...attachment,
      status: { type: "complete" },
      content: [
        {
          type: "file",
          data: base64,
          mimeType: attachment.file.type,
          filename: attachment.name,
        },
      ],
    };
  }

  async remove(): Promise<void> {
    // noop
  }
}

export function createGatewayCompositeAttachmentAdapter(): CompositeAttachmentAdapter {
  return new CompositeAttachmentAdapter([
    new SimpleImageAttachmentAdapter(),
    new GatewayBinaryAttachmentAdapter(),
  ]);
}
