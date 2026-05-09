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
} from "../adapters/gateway/message-normalize";

export type { RawMessage } from "@/components/chat/types";
export { useGatewayEventBridge } from "./hooks/use-gateway-event-bridge";
