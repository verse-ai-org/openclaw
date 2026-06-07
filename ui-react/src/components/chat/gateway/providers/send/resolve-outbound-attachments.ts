import type { ChatAttachmentRef } from "./attachment-ref";

export type GatewayOutboundAttachment = {
  content: string;
  mimeType: string;
  fileName: string;
};

export type ResolveOutboundAttachmentsResult =
  | {
      ok: true;
      base64Attachments: GatewayOutboundAttachment[];
      attachmentRefs: ChatAttachmentRef[];
    }
  | {
      ok: false;
      missingPathFiles: string[];
    };

/** Route images/docs to base64 or path refs for chat.send. */
export function resolveOutboundAttachments(params: {
  gatewayAttachments: GatewayOutboundAttachment[];
  attachmentRefs: ChatAttachmentRef[];
  missingPathFiles: string[];
}): ResolveOutboundAttachmentsResult {
  const documentBase64 = params.gatewayAttachments.filter(
    (att) => !att.mimeType.startsWith("image/"),
  );
  const nonImageMissingPaths = params.missingPathFiles.filter((name) => {
    const coveredByBase64 = documentBase64.some((att) => att.fileName === name);
    return !coveredByBase64;
  });
  if (nonImageMissingPaths.length > 0) {
    return { ok: false, missingPathFiles: nonImageMissingPaths };
  }

  const base64Attachments = params.gatewayAttachments.filter(
    (att) => typeof att.content === "string" && att.content.trim().length > 0,
  );

  return {
    ok: true,
    base64Attachments,
    attachmentRefs: params.attachmentRefs,
  };
}
