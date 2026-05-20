import { applyCanonicalEvent, emptyConversationState } from "./reducer";
import { EventType } from "./types";
import type { CanonicalChatEvent, ConversationState, RunId, ThreadId } from "./types";

/**
 * Events to start a new outbound chat.send run: finish any still-running prior run in
 * this thread, then mark the next run as active.
 */
export function buildBeginOutboundRunEvents(
  state: ConversationState,
  threadId: ThreadId,
  nextRunId: RunId,
  tsBase = Date.now(),
): CanonicalChatEvent[] {
  const events: CanonicalChatEvent[] = [];
  let ts = tsBase;

  const prevActive = state.activeRunId;
  if (prevActive && prevActive !== nextRunId) {
    const prevRun = state.runsById.get(prevActive);
    if (prevRun?.status === "running") {
      ts += 1;
      events.push({
        type: EventType.RunFinished,
        threadId,
        runId: prevActive,
        ts,
      });
    }
  }

  ts += 1;
  events.push({
    type: EventType.RunStarted,
    threadId,
    runId: nextRunId,
    ts,
  });

  return events;
}

export function applyBeginOutboundRun(
  state: ConversationState,
  threadId: ThreadId,
  nextRunId: RunId,
  tsBase = Date.now(),
): ConversationState {
  let next = state;
  for (const event of buildBeginOutboundRunEvents(state, threadId, nextRunId, tsBase)) {
    next = applyCanonicalEvent(next, event);
  }
  return next;
}

export function beginOutboundRunForThread(
  byThread: Record<string, ConversationState>,
  threadId: ThreadId,
  nextRunId: RunId,
): Record<string, ConversationState> {
  const prev = byThread[threadId] ?? emptyConversationState(threadId);
  return {
    ...byThread,
    [threadId]: applyBeginOutboundRun(prev, threadId, nextRunId),
  };
}
