// Semantic facade for Control UI chat gateway utilities.

export {
  getActiveChatSessionKey,
  isChatEventForActiveSession,
} from "../session/session-scope";
export { resolveActiveChatSessionKey } from "../session/active-session";

export {
  normalizeContent,
  normalizeHistoryAttachmentHints,
  normalizeRole,
  stripAttachmentContent,
} from "../messages/inbound/message-normalize";

export { mergeToolResults } from "./gateway-history-normalize";
export { extractContentBlocks } from "./gateway-content-blocks";

export type { RawMessage } from "@/components/chat/types";
export { useGatewayEventBridge } from "./hooks/use-gateway-event-bridge";
