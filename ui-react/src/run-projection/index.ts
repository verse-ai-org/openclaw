/**
 * Client-only live run assembly for Control UI chat. WS payloads enter via
 * `hooks/chat-event-bridge` (handlers + `dispatch-gateway-chat.ts`); **terminal**
 * persistence is coordinated in `handlers/shared.ts` (`finalizeChatRun`).
 */
export type { RunProjectionAction, RunProjectionState } from "./types";
export { emptyRunProjectionState, runProjectionReducer } from "./reducer";
export {
  chatDeltaToAction,
  commitCurrentTextAction,
  upsertInteractiveStreamAction,
  upsertToolStreamAction,
} from "./normalize";
export {
  buildFinalAssistantMessageFromProjection,
  finalizeProjectionToAssistantMessage,
  hasBufferedAssistantProjection,
  mergeAssistantRunMessages,
  selectThreadMessages,
  type SelectThreadMessagesParams,
} from "./selectors";
export { useRunProjectionStore } from "./store";
