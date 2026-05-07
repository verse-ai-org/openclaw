/**
 * Central run event dispatcher.
 *
 * Receives RunEvents (already translated from Gateway wire format by
 * gateway-run-adapter), applies session/run guards, feeds them into the
 * RunState reducer stored in chatStore, and handles lifecycle transitions
 * (commit final message, clear run).
 */
import { useChatStore } from "@/store/chat.store";
import { getActiveChatSessionKey } from "@/components/chat/session/session-scope";
import { emptyRunState, applyRunEvent, isTerminal } from "./run-state";
import { toFinalMessage } from "./run-message";
import type { RunEvent } from "./run-event";

/**
 * Dispatch a batch of RunEvents to the active run in chatStore.
 *
 * @param events         RunEvents translated from a single Gateway WS message.
 * @param eventSessionKey Session key extracted from the WS payload.
 * @param eventRunId      Run id extracted from the WS payload (may be undefined).
 */
export function dispatchRunEvents(
  events: RunEvent[],
  eventSessionKey: string,
  eventRunId: string | undefined,
): void {
  if (events.length === 0) return;

  const activeSessionKey = getActiveChatSessionKey();
  // Drop events that don't target the currently viewed session.
  if (!eventSessionKey || eventSessionKey !== activeSessionKey) return;

  for (const event of events) {
    _applyEvent(event, activeSessionKey, eventRunId);
  }
}

function _applyEvent(
  event: RunEvent,
  activeSessionKey: string,
  eventRunId: string | undefined,
): void {
  if (event.type === "run.started") {
    // Always accept run.started — it establishes (or re-establishes) the active run.
    useChatStore.setState((s) => ({
      activeRunState: applyRunEvent(
        // If there is already a run state (e.g. optimistically created by sendMessage),
        // update it; otherwise start fresh.
        s.activeRunState ?? emptyRunState(activeSessionKey, event.runId),
        event,
      ),
    }));
    useChatStore.getState().markSessionGenerating(activeSessionKey, event.runId);
    return;
  }

  const current = useChatStore.getState().activeRunState;
  if (!current) return; // no active run — drop

  // Stale-event guard: if the event carries a specific runId that doesn't match
  // the active run, silently drop it.
  if (eventRunId && current.runId && current.runId !== eventRunId) return;

  const next = applyRunEvent(current, event);

  if (isTerminal(next)) {
    _handleTerminal(next, activeSessionKey);
  } else {
    useChatStore.setState({ activeRunState: next });
  }
}

function _handleTerminal(
  finalState: ReturnType<typeof applyRunEvent>,
  activeSessionKey: string,
): void {
  const finalMsg = toFinalMessage(finalState);
  const errorMessage =
    finalState.status === "error"
      ? (finalState.errorMessage?.trim() || "Generation failed. Please try again.")
      : null;

  useChatStore.setState((s) => ({
    activeRunState: null,
    sending: false,
    runId: null,
    messages: finalMsg ? [...s.messages, finalMsg] : s.messages,
    lastError: errorMessage,
  }));

  const st = useChatStore.getState();
  st.clearSessionGenerating(activeSessionKey);
  // st.triggerSessionsReload();
}
