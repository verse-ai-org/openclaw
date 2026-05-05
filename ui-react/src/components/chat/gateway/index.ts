// Semantic facade for Control UI chat gateway utilities + bridge wiring.
//
// This consolidates the historically-scattered `hooks/chat-event-bridge/index.ts`
// exports under `chat/gateway/*`, while keeping a stable single import path.

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
} from "../utils/message-normalize";

export { mergeToolResults } from "./gateway-history-normalize";
export { extractContentBlocks } from "./gateway-content-blocks";

export type { RawMessage } from "@/components/chat/types";
export { useGatewayEventBridge } from "./hooks/chat-event-bridge/use-gateway-event-bridge";
export { clearBridgeActiveRunForSession } from "./hooks/chat-event-bridge/run-bridge-context";
