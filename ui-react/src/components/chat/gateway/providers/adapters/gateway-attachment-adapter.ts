import type {
  AttachmentAdapter,
  CompleteAttachment,
  PendingAttachment,
} from "@assistant-ui/react";
import {
  CompositeAttachmentAdapter,
} from "@assistant-ui/react";
import { toast } from "sonner";

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
]);

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB per file
const ALLOWED_MIME_LIST = [...ALLOWED_MIME_TYPES].join(",");
export const MAX_ATTACHMENT_COUNT = 10;
export const MAX_FILE_SIZE_BYTES_REFERENCE_MODE = 100 * 1024 * 1024; // 100MB per file

class GatewayBinaryAttachmentAdapter implements AttachmentAdapter {
  // Restrict picker to supported document/text MIME types.
  accept = ALLOWED_MIME_LIST;

  async add(state: { file: File }): Promise<PendingAttachment> {
    const { file } = state;
    if (file.type.startsWith("image/")) {
      const msg = "Image uploads are currently disabled.";
      toast.error(msg, { duration: 3000 });
      throw new Error(msg);
    }
    if (file.size <= 0) {
      const msg = `Empty files are not supported: ${file.name}`;
      toast.error(msg, { duration: 3000 });
      throw new Error(msg);
    }
    if (file.size > MAX_FILE_SIZE_BYTES_REFERENCE_MODE) {
      const msg = `File is too large: ${file.name}. Max size is 100MB.`;
      toast.error(msg, { duration: 3000 });
      throw new Error(msg);
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      const msg = `Unsupported file type: ${file.name}`;
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

  async remove(): Promise<void> {
    // noop
  }
}

export function createGatewayCompositeAttachmentAdapter(): CompositeAttachmentAdapter {
  return new CompositeAttachmentAdapter([new GatewayBinaryAttachmentAdapter()]);
}
