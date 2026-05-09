import type {
  CanonicalChatEvent,
  CanonicalMessage,
  ConversationState,
  MessageId,
  PartId,
  RunId,
  ThreadId,
} from "./types";
import { EventType } from "./types";

function upsertMessage(state: ConversationState, msg: CanonicalMessage): ConversationState {
  const byId = new Map(state.messagesById);
  const exists = byId.has(msg.id);
  byId.set(msg.id, msg);
  const order = exists ? state.messageOrder : [...state.messageOrder, msg.id];
  return { ...state, messagesById: byId, messageOrder: order };
}

function ensureAssistantMessageForRun(state: ConversationState, runId: RunId, ts: number): {
  state: ConversationState;
  messageId: MessageId;
} {
  const run = state.runsById.get(runId);
  const existing = run?.assistantMessageId;
  if (existing) return { state, messageId: existing };

  const messageId = `run:${runId}` as MessageId;
  const createdAt = ts;
  const msg: CanonicalMessage = {
    id: messageId,
    role: "assistant",
    createdAt,
    runId,
    status: "running",
    parts: [],
  };

  const next = upsertMessage(state, msg);
  const runsById = new Map(next.runsById);
  if (run) {
    runsById.set(runId, { ...run, assistantMessageId: messageId });
  }
  return { state: { ...next, runsById }, messageId };
}

function maybeLinkRunAssistantMessage(
  state: ConversationState,
  messageId: MessageId,
): ConversationState {
  if (!messageId.startsWith("run:")) return state;
  const runId = messageId.slice("run:".length) as RunId;
  const run = state.runsById.get(runId);
  if (!run || run.assistantMessageId) return state;
  const runsById = new Map(state.runsById);
  runsById.set(runId, { ...run, assistantMessageId: messageId });
  return { ...state, runsById };
}

function flushLiveTextToPart(
  state: ConversationState,
  messageId: MessageId,
  partId: PartId,
): ConversationState {
  // `liveTextByMessageId` stores only the *tail* beyond committed text parts.
  const live = state.liveTextByMessageId.get(messageId) ?? "";
  const msg = state.messagesById.get(messageId);
  if (!msg) return state;

  const text = live.trim() ? live : "";
  if (!text) {
    const liveTextByMessageId = new Map(state.liveTextByMessageId);
    liveTextByMessageId.delete(messageId);
    return { ...state, liveTextByMessageId };
  }

  const nextMsg: CanonicalMessage = {
    ...msg,
    parts: [...msg.parts, { type: "text", id: partId, text }],
  };
  const next = upsertMessage(state, nextMsg);
  const liveTextByMessageId = new Map(next.liveTextByMessageId);
  liveTextByMessageId.delete(messageId);
  return { ...next, liveTextByMessageId };
}

function committedTextPrefix(parts: CanonicalMessage["parts"]): string {
  return parts
    .filter((p): p is Extract<(typeof parts)[number], { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function resetMessageToSnapshotText(
  state: ConversationState,
  messageId: MessageId,
  fullText: string,
  ts: number,
): ConversationState {
  const msg = state.messagesById.get(messageId);
  if (!msg) return state;

  const nextMsg: CanonicalMessage = {
    ...msg,
    parts: fullText.trim()
      ? [{ type: "text", id: `text:${ts}` as PartId, text: fullText }]
      : [],
  };

  const after = upsertMessage(state, nextMsg);

  // Drop any tool index entries pointing at this message. A snapshot mismatch implies
  // we cannot safely preserve tool/text interleaving from prior incremental assembly.
  const toolPartIndex = new Map(after.toolPartIndex);
  for (const [toolId, where] of toolPartIndex) {
    if (where.messageId === messageId) toolPartIndex.delete(toolId);
  }

  const liveTextByMessageId = new Map(after.liveTextByMessageId);
  liveTextByMessageId.delete(messageId);

  return { ...after, toolPartIndex, liveTextByMessageId };
}

export function emptyConversationState(threadId: ThreadId): ConversationState {
  return {
    threadId,
    messagesById: new Map(),
    messageOrder: [],
    runsById: new Map(),
    activeRunId: undefined,
    eventLog: [],
    liveTextByMessageId: new Map(),
    toolPartIndex: new Map(),
  };
}

export function applyCanonicalEvent(s: ConversationState, event: CanonicalChatEvent): ConversationState {
  // Ignore cross-thread events (helps when a dispatcher fans in).
  if (event.threadId !== s.threadId) return s;

  const next: ConversationState = { ...s, eventLog: [...s.eventLog, event] };

  switch (event.type) {
    case EventType.MessagesSnapshot: {
      let out = { ...next, messagesById: new Map(), messageOrder: [] as string[] };
      for (const m of event.messages) {
        out = upsertMessage(out, m);
      }
      return out;
    }

    case EventType.RunStarted: {
      const runsById = new Map(next.runsById);
      runsById.set(event.runId, {
        id: event.runId,
        threadId: event.threadId,
        status: "running",
        startedAt: event.ts,
      });
      return { ...next, runsById, activeRunId: event.runId };
    }

    case EventType.RunActiveSnapshot: {
      if (!event.runId) {
        return { ...next, activeRunId: undefined };
      }
      const runsById = new Map(next.runsById);
      if (!runsById.has(event.runId)) {
        runsById.set(event.runId, {
          id: event.runId,
          threadId: event.threadId,
          status: "running",
          startedAt: typeof event.startedAt === "number" ? event.startedAt : event.ts,
        });
      }
      return { ...next, runsById, activeRunId: event.runId };
    }

    case EventType.RunFinished:
    case EventType.RunError:
    case EventType.RunAborted: {
      const run = next.runsById.get(event.runId);
      if (!run) return next;
      const runsById = new Map(next.runsById);
      const status =
        event.type === EventType.RunFinished
          ? "finished"
          : event.type === EventType.RunAborted
            ? "aborted"
            : "error";
      runsById.set(event.runId, {
        ...run,
        status,
        finishedAt: event.ts,
        errorMessage: event.type === EventType.RunError ? event.message : run.errorMessage,
      });

      // Flush any remaining live text and mark assistant message complete if we created it.
      const msgId = run.assistantMessageId;
      if (msgId) {
        const flushed = flushLiveTextToPart({ ...next, runsById }, msgId, `text:${event.ts}` as PartId);
        const msg = flushed.messagesById.get(msgId);
        if (msg) {
          const updated: CanonicalMessage = { ...msg, status: "complete" };
          const afterMsg = upsertMessage(flushed, updated);
          return { ...afterMsg, activeRunId: undefined };
        }

        return { ...flushed, activeRunId: undefined };
      }

      return { ...next, runsById, activeRunId: undefined };
    }

    case EventType.MessageStart: {
      const msg: CanonicalMessage = {
        id: event.message.id,
        role: event.message.role,
        createdAt: event.message.createdAt,
        runId: event.message.runId,
        status: "running",
        parts: [],
        attachments: event.message.attachments,
        metadata: event.message.metadata,
      };
      return upsertMessage(next, msg);
    }

    case EventType.MessageAppendText: {
      // Ensure the target message exists (agent delta path can start before any snapshot).
      const existing = next.messagesById.get(event.messageId);
      let base = next;
      if (!existing) {
        const msg: CanonicalMessage = {
          id: event.messageId,
          role: "assistant",
          createdAt: event.ts,
          status: "running",
          parts: [],
        };
        base = maybeLinkRunAssistantMessage(upsertMessage(next, msg), event.messageId);
      }

      const msg = base.messagesById.get(event.messageId);
      if (!msg) return base;

      // Merge consecutive text appends to keep parts compact.
      const parts = msg.parts.slice();
      const last = parts.at(-1);
      if (last?.type === "text") {
        parts[parts.length - 1] = { ...last, text: last.text + event.text };
      } else {
        parts.push({ type: "text", id: event.partId, text: event.text });
      }

      const updated: CanonicalMessage = { ...msg, parts };
      return upsertMessage(maybeLinkRunAssistantMessage(base, event.messageId), updated);
    }

    case EventType.MessageSetLiveText: {
      // Ensure the target message exists so the UI can render a running row while streaming.
      const existing = next.messagesById.get(event.messageId);
      let base = next;
      if (!existing) {
        const msg: CanonicalMessage = {
          id: event.messageId,
          role: "assistant",
          createdAt: event.ts,
          status: "running",
          parts: [],
        };
        base = maybeLinkRunAssistantMessage(upsertMessage(next, msg), event.messageId);
      }

      const current = base.messagesById.get(event.messageId);
      if (!current) return base;

      const committed = committedTextPrefix(current.parts);
      if (!event.fullText.startsWith(committed)) {
        // Snapshot mismatch: reset the message text to the authoritative snapshot.
        return resetMessageToSnapshotText(
          maybeLinkRunAssistantMessage(base, event.messageId),
          event.messageId,
          event.fullText,
          event.ts,
        );
      }

      const liveTail = event.fullText.slice(committed.length);
      const liveTextByMessageId = new Map(base.liveTextByMessageId);
      liveTextByMessageId.set(event.messageId, liveTail);
      return { ...maybeLinkRunAssistantMessage(base, event.messageId), liveTextByMessageId };
    }

    case EventType.MessageEnd: {
      const msg = next.messagesById.get(event.messageId);
      if (!msg) return next;
      const updated: CanonicalMessage = { ...msg, status: "complete" };
      return upsertMessage(next, updated);
    }

    case EventType.ToolStart: {
      const ensured = ensureAssistantMessageForRun(next, event.runId, event.ts);
      const withTextFlushed = flushLiveTextToPart(ensured.state, ensured.messageId, `text:${event.ts}` as PartId);
      const msg = withTextFlushed.messagesById.get(ensured.messageId);
      if (!msg) return withTextFlushed;

      const index = msg.parts.length;
      const toolPart = {
        type: "tool" as const,
        id: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
        status: "running" as const,
      };

      const updated: CanonicalMessage = { ...msg, parts: [...msg.parts, toolPart] };
      const after = upsertMessage(withTextFlushed, updated);
      const toolPartIndex = new Map(after.toolPartIndex);
      toolPartIndex.set(event.toolCallId, { messageId: ensured.messageId, index });
      return { ...after, toolPartIndex };
    }

    case EventType.ToolUi: {
      const where = next.toolPartIndex.get(event.toolCallId);
      if (!where) return next;
      const msg = next.messagesById.get(where.messageId);
      if (!msg) return next;
      const part = msg.parts[where.index];
      if (!part || part.type !== "tool" || part.id !== event.toolCallId) return next;

      const parts = msg.parts.slice();
      parts[where.index] = {
        ...part,
        ui: { kind: event.kind, payload: event.payload },
      };
      return upsertMessage(next, { ...msg, parts });
    }

    case EventType.ToolUpdate:
    case EventType.ToolResult:
    case EventType.ToolError: {
      const where = next.toolPartIndex.get(event.toolCallId);
      if (!where) return next;
      const msg = next.messagesById.get(where.messageId);
      if (!msg) return next;
      const part = msg.parts[where.index];
      if (!part || part.type !== "tool" || part.id !== event.toolCallId) return next;

      const updatedPart =
        event.type === EventType.ToolUpdate
          ? { ...part, status: "running" as const, output: event.partialOutput ?? part.output }
          : event.type === EventType.ToolResult
            ? { ...part, status: "result" as const, output: event.output }
            : { ...part, status: "error" as const, error: event.error };

      const parts = msg.parts.slice();
      parts[where.index] = updatedPart;
      return upsertMessage(next, { ...msg, parts });
    }

    default:
      return next;
  }
}

export function replayConversation(events: CanonicalChatEvent[], threadId: ThreadId): ConversationState {
  let s = emptyConversationState(threadId);
  for (const e of events) {
    s = applyCanonicalEvent(s, e);
  }
  return s;
}
