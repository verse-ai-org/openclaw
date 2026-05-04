import { chatDeltaToAction, useRunProjectionStore } from "@/run-projection";
import { extractMessageText } from "../message-normalize";
import { isChatEventForActiveSession } from "../session-scope";
import {
  normalizeRunId,
  normalizeSessionKey,
  shouldAcceptRunEvent,
} from "../run-guard";
import {
  finalizeChatRun,
  toRunEventKindFromChatState,
  type BridgeRuntimeContext,
} from "./shared";
import type { BridgeEventOutcome } from "./event-outcome";

export type ChatEventPayload = {
  runId?: string;
  sessionKey?: string;
  state?: string;
  message?: unknown;
  errorMessage?: string;
};

export function handleChatEvent(
  ctx: BridgeRuntimeContext,
  payload: ChatEventPayload | undefined,
): BridgeEventOutcome {
  const state = payload?.state;
  const sk = normalizeSessionKey(payload?.sessionKey);
  const runId = normalizeRunId(payload?.runId);
  const eventKind = toRunEventKindFromChatState(state);

  const isActiveSession = isChatEventForActiveSession(payload?.sessionKey);
  const shouldAccept = shouldAcceptRunEvent({
    activeRunBySession: ctx.activeRunBySession,
    sessionKey: sk,
    runId,
    eventKind,
  });

  if (sk && !shouldAccept) {
    return { kind: "ignored", reason: "stale", summary: `chat.${state ?? "unknown"}` };
  }
  if (!isActiveSession) {
    return {
      kind: "ignored",
      reason: "inactive_session",
      summary: `chat.${state ?? "unknown"}`,
    };
  }

  if (state === "delta") {
    const text = extractMessageText(payload?.message);
    if (text) {
      useRunProjectionStore.getState().dispatch(chatDeltaToAction(text));
    }
    return { kind: "applied", summary: "chat.delta" };
  }

  if (state === "final") {
    if (!sk) {
      return { kind: "ignored", reason: "missing_session_key", summary: "chat.final" };
    }
    finalizeChatRun({
      sessionKey: sk,
      runId,
      state: "final",
      messageText: extractMessageText(payload?.message),
      ctx,
    });
    return { kind: "finalized", summary: "chat.final" };
  }

  if (state === "aborted" || state === "error") {
    if (!sk) {
      return {
        kind: "ignored",
        reason: "missing_session_key",
        summary: `chat.${state}`,
      };
    }
    finalizeChatRun({
      sessionKey: sk,
      runId,
      state,
      errorMessage: payload?.errorMessage,
      ctx,
    });
    return { kind: "finalized", summary: `chat.${state}` };
  }

  return { kind: "ignored", reason: "unhandled_state", summary: `chat.${state ?? "unknown"}` };
}
