export type { ChatAttachmentRef } from "./attachment-ref";
export { buildAttachmentRefsFromMessage } from "./attachment-ref";

export {
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_COUNT,
  MAX_IMAGE_SIZE_BYTES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_BYTES_REFERENCE_MODE,
  createGatewayCompositeAttachmentAdapter,
} from "./attachment-adapter";

export { parseGatewaySendPayload, type ParsedGatewaySendPayload } from "./parse-send-payload";

