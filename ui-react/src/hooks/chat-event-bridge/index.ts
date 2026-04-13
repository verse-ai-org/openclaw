export {
  getActiveChatSessionKey,
  isChatEventForActiveSession,
} from "./session-scope";
export {
  normalizeContent,
  normalizeHistoryAttachmentHints,
  normalizeRole,
  stripAttachmentContent,
} from "./message-normalize";
export {
  consolidateToolMessages,
  extractContentBlocks,
  extractToolCallParts,
  mergeToolResults,
} from "./tool-blocks";
export type { RawMessage } from "./types";
export { useChatEventBridge } from "./useChatEventBridge";
