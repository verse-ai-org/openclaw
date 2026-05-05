import { useChatStore } from "@/store/chat.store";
import { chatDeltaToAction, useRunProjectionStore } from "@/run-projection";
import { extractMessageText } from "../../../../utils/message-normalize";
import { isChatEventForActiveSession } from "@/components/chat/session/session-scope";
import {
  normalizeRunId,
  normalizeSessionKey,
  shouldAcceptRunEvent,
} from "@/components/chat/gateway/run-guard";
import {
  finalizeChatRun,
  toRunEventKindFromChatState,
} from "./shared";
import type {
  BridgeEventOutcome,
  BridgeRuntimeContext,
  GatewayChatEventPayload,
} from "@/components/chat/types";

export function handleChatEvent(
  ctx: BridgeRuntimeContext,
  payload: GatewayChatEventPayload | null,
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
    if (sk) {
      useChatStore.getState().markSessionGenerating(sk, runId);
    }
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
    // `GatewayChatEventState` intentionally allows unknown strings; compute a
    // narrow literal for terminal handling.
    const terminalState: "aborted" | "error" =
      state === "aborted" ? "aborted" : "error";
    finalizeChatRun({
      sessionKey: sk,
      runId,
      state: terminalState,
      errorMessage: payload?.errorMessage,
      ctx,
    });
    return { kind: "finalized", summary: `chat.${state}` };
  }

  return { kind: "ignored", reason: "unhandled_state", summary: `chat.${state ?? "unknown"}` };
}
