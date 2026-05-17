import type {
  CanonicalChatEvent,
  CanonicalMessage,
  ChatPart,
  ConversationState,
  MessageId,
  PartId,
  RunId,
  ThreadId,
} from "./types";
import { EventType } from "./types";
import { formatLiveTextSnapshotForLog, logChatDebug } from "../utils/chat-debug";

/**
 * Max trailing UTF-16 code units trimmed from committed text when `fullText` is a prefix (or
 * normalizes to one). Larger values tolerate slower `chat.delta` snapshots vs `agent.assistant`
 * appends; keep bounded to avoid wiping large accidental divergences.
 */
export const LIVE_TEXT_OVERSHOOT_TRIM_MAX = 128;

/** Normalize for prefix / equality checks only (display still uses raw gateway strings). */
export function normalizeLiveTextForPrefixCompare(s: string): string {
  const crlf = s.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  try {
    return crlf.normalize("NFC");
  } catch {
    return crlf;
  }
}

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

/** Rebuild tool lookup from committed messages (used after `MessagesSnapshot`). */
function rebuildToolPartIndexFromMessages(
  state: ConversationState,
): Map<PartId, { messageId: MessageId; index: number }> {
  const toolPartIndex = new Map<PartId, { messageId: MessageId; index: number }>();
  for (const messageId of state.messageOrder) {
    const msg = state.messagesById.get(messageId);
    if (!msg) continue;
    msg.parts.forEach((part, index) => {
      if (part.type === "tool") {
        toolPartIndex.set(part.id, { messageId, index });
      }
    });
  }
  return toolPartIndex;
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

/**
 * True when cumulative `fullText` is a strict prefix of locally committed text (raw or after
 * {@link normalizeLiveTextForPrefixCompare}), differing only by a small trailing suffix on
 * `committed`. Throttled chat snapshots can lag agent append deltas; trimming preserves tool parts
 * instead of `resetMessageToSnapshotText` wiping them.
 */
export function isLiveTextSnapOvershootOnly(committed: string, fullText: string): boolean {
  if (fullText.startsWith(committed)) {
    return false;
  }
  const overshoot = committed.length - fullText.length;
  if (!(fullText.length > 0 && overshoot > 0 && overshoot <= LIVE_TEXT_OVERSHOOT_TRIM_MAX)) {
    return false;
  }
  const nc = normalizeLiveTextForPrefixCompare(committed);
  const nf = normalizeLiveTextForPrefixCompare(fullText);
  return committed.startsWith(fullText) || nc.startsWith(nf);
}

/**
 * How gateway cumulative `fullText` relates to locally committed text parts (concat of `text` parts).
 *
 * - `snapshot-ahead`: `fullText` begins with `committed` (raw or after NFC/CRLF normalize) — normal
 *   streaming (append + chat agree).
 * - `local-ahead-trim`: `fullText` is a strict prefix of `committed` within a small tail window — chat
 *   snapshot can lag `agent.assistant` appends; reducer trims trailing committed chars to reconcile.
 * - `mismatch`: neither relationship — reducer replaces committed text from the snapshot but
 *   keeps tool parts (and tool UI) so interactive surfaces remain usable.
 */
export type LiveTextSnapshotClass = "snapshot-ahead" | "local-ahead-trim" | "mismatch";

export function classifyLiveTextSnapshot(committed: string, fullText: string): LiveTextSnapshotClass {
  if (fullText.startsWith(committed)) {
    return "snapshot-ahead";
  }
  const nf = normalizeLiveTextForPrefixCompare(fullText);
  const nc = normalizeLiveTextForPrefixCompare(committed);
  if (nf.startsWith(nc)) {
    return "snapshot-ahead";
  }
  if (isLiveTextSnapOvershootOnly(committed, fullText)) {
    return "local-ahead-trim";
  }
  return "mismatch";
}

/** Remove `removeCount` characters from the end of concatenated text parts (non-text parts untouched). */
function trimTrailingTextCharsFromParts(parts: ChatPart[], removeCount: number): ChatPart[] | null {
  if (removeCount <= 0) {
    return parts.slice();
  }
  let remaining = removeCount;
  const out = parts.slice();
  for (let i = out.length - 1; i >= 0 && remaining > 0; i--) {
    const p = out[i];
    if (p.type !== "text") {
      continue;
    }
    const len = p.text.length;
    const take = Math.min(remaining, len);
    remaining -= take;
    const newLen = len - take;
    if (newLen <= 0) {
      out.splice(i, 1);
    } else {
      out[i] = { ...p, text: p.text.slice(0, newLen) };
    }
  }
  return remaining > 0 ? null : out;
}

/**
 * Collapse committed text parts to a single snapshot string while preserving tool parts (and
 * `ToolPart.ui`) in their original timeline positions.
 */
function partsAfterSnapshotTextReset(
  existingParts: ChatPart[],
  fullText: string,
  ts: number,
): ChatPart[] {
  const out: ChatPart[] = [];
  let placedSnapshot = false;
  for (const p of existingParts) {
    if (p.type === "tool") {
      out.push(p);
      continue;
    }
    if (p.type === "text") {
      if (!placedSnapshot && fullText.trim()) {
        out.push({ type: "text", id: `text:${ts}` as PartId, text: fullText });
        placedSnapshot = true;
      }
    }
  }
  if (!placedSnapshot && fullText.trim()) {
    out.push({ type: "text", id: `text:${ts}` as PartId, text: fullText });
  }
  return out;
}

function upsertToolPartIndexForMessage(
  toolPartIndex: Map<PartId, { messageId: MessageId; index: number }>,
  messageId: MessageId,
  parts: ChatPart[],
): Map<PartId, { messageId: MessageId; index: number }> {
  const next = new Map(toolPartIndex);
  for (const [toolId, where] of next) {
    if (where.messageId === messageId) {
      next.delete(toolId);
    }
  }
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (part?.type === "tool") {
      next.set(part.id, { messageId, index });
    }
  }
  return next;
}

function resetMessageToSnapshotText(
  state: ConversationState,
  messageId: MessageId,
  fullText: string,
  ts: number,
): ConversationState {
  const msg = state.messagesById.get(messageId);
  if (!msg) return state;

  const parts = partsAfterSnapshotTextReset(msg.parts, fullText, ts);
  const nextMsg: CanonicalMessage = { ...msg, parts };

  const after = upsertMessage(state, nextMsg);
  const toolPartIndex = upsertToolPartIndexForMessage(after.toolPartIndex, messageId, parts);

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
      let out: ConversationState = {
        ...next,
        messagesById: new Map(),
        messageOrder: [],
        liveTextByMessageId: new Map(),
        runsById:
          event.runs !== undefined
            ? new Map(event.runs.map((r) => [r.id, r]))
            : new Map(next.runsById),
      };
      for (const m of event.messages) {
        out = upsertMessage(out, m);
      }
      const toolPartIndex = rebuildToolPartIndexFromMessages(out);
      // Checkpoint: prior incremental events no longer describe this transcript.
      return { ...out, toolPartIndex, eventLog: [event] };
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
      const assistantMessageId = `run:${event.runId}` as MessageId;
      if (!runsById.has(event.runId)) {
        runsById.set(event.runId, {
          id: event.runId,
          threadId: event.threadId,
          status: "running",
          startedAt: typeof event.startedAt === "number" ? event.startedAt : event.ts,
        });
      } else {
        // Status probes are authoritative for "is this run still active?".
        // If we already have a run record, keep timestamps but ensure it is marked running.
        const existing = runsById.get(event.runId);
        if (existing) {
          runsById.set(event.runId, { ...existing, status: "running" });
        }
      }

      // Ensure there's a visible assistant row for the in-flight run. History snapshots mark
      // messages as complete, but an active run probe implies we should render it as running.
      const existingMsg = next.messagesById.get(assistantMessageId);
      const msg: CanonicalMessage =
        existingMsg && existingMsg.role === "assistant"
          ? { ...existingMsg, status: "running", runId: event.runId }
          : {
              id: assistantMessageId,
              role: "assistant",
              createdAt: typeof event.startedAt === "number" ? event.startedAt : event.ts,
              runId: event.runId,
              status: "running",
              parts: [],
            };

      const afterMsg = upsertMessage(next, msg);
      const linkedRun = runsById.get(event.runId);
      if (linkedRun && !linkedRun.assistantMessageId) {
        runsById.set(event.runId, { ...linkedRun, assistantMessageId });
      }

      return { ...afterMsg, runsById, activeRunId: event.runId };
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
      const relation = classifyLiveTextSnapshot(committed, event.fullText);

      if (relation === "snapshot-ahead") {
        const liveTail = event.fullText.slice(committed.length);
        const liveTextByMessageId = new Map(base.liveTextByMessageId);
        liveTextByMessageId.set(event.messageId, liveTail);
        return { ...maybeLinkRunAssistantMessage(base, event.messageId), liveTextByMessageId };
      }

      if (relation === "local-ahead-trim") {
        const overshoot = committed.length - event.fullText.length;
        const trimmedParts = trimTrailingTextCharsFromParts(current.parts, overshoot);
        const reconciledCommitted = trimmedParts ? committedTextPrefix(trimmedParts) : "";
        const reconciledNorm = normalizeLiveTextForPrefixCompare(reconciledCommitted);
        const snapshotNorm = normalizeLiveTextForPrefixCompare(event.fullText);
        const reconciledOk =
          trimmedParts &&
          (reconciledCommitted === event.fullText || reconciledNorm === snapshotNorm);
        if (reconciledOk) {
          const reconciledMsg: CanonicalMessage = { ...current, parts: trimmedParts };
          const afterUpsert = upsertMessage(
            maybeLinkRunAssistantMessage(base, event.messageId),
            reconciledMsg,
          );
          const liveTail =
            reconciledCommitted === event.fullText
              ? event.fullText.slice(reconciledCommitted.length)
              : "";
          const liveTextByMessageId = new Map(afterUpsert.liveTextByMessageId);
          liveTextByMessageId.set(event.messageId, liveTail);
          return { ...maybeLinkRunAssistantMessage(afterUpsert, event.messageId), liveTextByMessageId };
        }

        logChatDebug(
          "warn",
          "live text snapshot: trim reconcile failed; resetting message text to snapshot",
          {
            reason: "trim-reconcile-failed",
            ...formatLiveTextSnapshotForLog(committed, event.fullText),
          },
          {
            channel: "projection",
            sessionKey: event.threadId,
            runId: event.messageId.startsWith("run:") ? event.messageId.slice(4) : undefined,
          },
        );
        return resetMessageToSnapshotText(
          maybeLinkRunAssistantMessage(base, event.messageId),
          event.messageId,
          event.fullText,
          event.ts,
        );
      }

      logChatDebug(
        "warn",
        "live text snapshot: hard mismatch; resetting message text to snapshot",
        {
          reason: "hard-mismatch",
          ...formatLiveTextSnapshotForLog(committed, event.fullText),
        },
        {
          channel: "projection",
          sessionKey: event.threadId,
          runId: event.messageId.startsWith("run:") ? event.messageId.slice(4) : undefined,
        },
      );
      return resetMessageToSnapshotText(
        maybeLinkRunAssistantMessage(base, event.messageId),
        event.messageId,
        event.fullText,
        event.ts,
      );
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
