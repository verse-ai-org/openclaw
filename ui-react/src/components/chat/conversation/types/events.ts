import type { ChatRole, MessageId, PartId, RunId, ThreadId } from "./ids";
import type { CanonicalMessage } from "./message";
import type { EventType } from "./event-type";

export type RunEvent =
  | { type: typeof EventType.RunStarted; threadId: ThreadId; runId: RunId; ts: number }
  | { type: typeof EventType.RunFinished; threadId: ThreadId; runId: RunId; ts: number }
  | { type: typeof EventType.RunError; threadId: ThreadId; runId: RunId; ts: number; message?: string }
  | { type: typeof EventType.RunAborted; threadId: ThreadId; runId: RunId; ts: number }
  | {
      /**
       * Snapshot from a backend status probe (e.g. `chat.status`).
       * This is not a terminal event; it only (re)establishes which run is active.
       */
      type: typeof EventType.RunActiveSnapshot;
      threadId: ThreadId;
      ts: number;
      runId: RunId | null;
      startedAt?: number | null;
    };

export type SnapshotEvent =
  | { type: typeof EventType.MessagesSnapshot; threadId: ThreadId; ts: number; messages: CanonicalMessage[] };

export type MessageEvent =
  | {
      type: typeof EventType.MessageStart;
      threadId: ThreadId;
      ts: number;
      message: {
        id: MessageId;
        role: ChatRole;
        createdAt: number;
        runId?: RunId;
        attachments?: import("@/components/chat/types").MessageAttachment[];
        metadata?: import("@/components/chat/types").ChatMessageMetadata;
      };
    }
  | {
      type: typeof EventType.MessageAppendText;
      threadId: ThreadId;
      ts: number;
      messageId: MessageId;
      partId: PartId;
      text: string;
    }
  | {
      /**
       * Set the full text of the current streaming tail (gateway-style cumulative stream).
       * Reducers may compact this into one or more text parts.
       */
      type: typeof EventType.MessageSetLiveText;
      threadId: ThreadId;
      ts: number;
      messageId: MessageId;
      fullText: string;
    }
  | { type: typeof EventType.MessageEnd; threadId: ThreadId; ts: number; messageId: MessageId };

export type ToolEvent =
  | {
      type: typeof EventType.ToolStart;
      threadId: ThreadId;
      runId: RunId;
      ts: number;
      toolCallId: PartId;
      toolName: string;
      args?: unknown;
    }
  | {
      type: typeof EventType.ToolUi;
      threadId: ThreadId;
      runId: RunId;
      ts: number;
      toolCallId: PartId;
      toolName: string;
      kind: string;
      payload: unknown;
    }
  | {
      type: typeof EventType.ToolUpdate;
      threadId: ThreadId;
      runId: RunId;
      ts: number;
      toolCallId: PartId;
      partialOutput?: unknown;
    }
  | {
      type: typeof EventType.ToolResult;
      threadId: ThreadId;
      runId: RunId;
      ts: number;
      toolCallId: PartId;
      output?: unknown;
    }
  | {
      type: typeof EventType.ToolError;
      threadId: ThreadId;
      runId: RunId;
      ts: number;
      toolCallId: PartId;
      error?: string;
    };

export type CanonicalChatEvent =
  | RunEvent
  | SnapshotEvent
  | MessageEvent
  | ToolEvent;
