import type { MessageId, PartId, RunId, ThreadId } from "./ids";
import type { CanonicalChatEvent } from "./events";
import type { CanonicalMessage } from "./message";
import type { CanonicalRun } from "./run";

export type ConversationState = {
  threadId: ThreadId;
  messagesById: Map<MessageId, CanonicalMessage>;
  messageOrder: MessageId[];
  runsById: Map<RunId, CanonicalRun>;
  activeRunId?: RunId;
  /** Append-only event log, for replay/debug. */
  eventLog: CanonicalChatEvent[];
  /**
   * Live text buffer (tail beyond committed parts) keyed by messageId.
   * Kept separate so we can compact it into text parts at boundaries.
   */
  liveTextByMessageId: Map<MessageId, string>;
  /**
   * Part index lookup for in-place tool updates.
   * Keyed by toolCallId, value is [messageId, partIndex].
   */
  toolPartIndex: Map<PartId, { messageId: MessageId; index: number }>;
};

