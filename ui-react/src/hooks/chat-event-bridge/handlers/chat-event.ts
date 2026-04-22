import { useChatStore } from "@/store/chat.store";
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
import { logBridgeEvent } from "./bridge-debug";

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
) {
  const state = payload?.state;
  const sk = normalizeSessionKey(payload?.sessionKey);
  const runId = normalizeRunId(payload?.runId);
  const eventKind = toRunEventKindFromChatState(state);

  if (
    sk &&
    !shouldAcceptRunEvent({
      activeRunBySession: ctx.activeRunBySession,
      sessionKey: sk,
      runId,
      eventKind,
    })
  ) {
    logBridgeEvent("warn", "drop stale chat event", {
      state,
      sessionKey: sk,
      runId,
      activeRunId: ctx.activeRunBySession.get(sk),
    }, {
      channel: "chat",
      sessionKey: sk,
      runId,
      state,
    });
    return;
  }
  if (!isChatEventForActiveSession(payload?.sessionKey)) {
    logBridgeEvent("debug", "skip chat event for inactive session", {
      state,
      sessionKey: payload?.sessionKey,
      runId,
    }, { channel: "chat", runId, state });
    return;
  }

  if (state === "delta") {
    if (sk) {
      useChatStore.getState().markSessionGenerating(sk, runId);
    }
    const text = extractMessageText(payload?.message);
    if (text) {
      useChatStore.getState().setStream(text);
      logBridgeEvent(
        "debug",
        "chat delta applied",
        { sessionKey: sk, runId },
        { channel: "chat", sessionKey: sk, runId, state },
      );
    }
    return;
  }

  if (state === "final") {
    if (!sk) {
      return;
    }
    if (runId) {
      const timer = ctx.pendingLifecycleFinalizeByRun.get(runId);
      if (timer) {
        clearTimeout(timer);
        ctx.pendingLifecycleFinalizeByRun.delete(runId);
      }
    }
    finalizeChatRun({
      sessionKey: sk,
      runId,
      state: "final",
      messageText: extractMessageText(payload?.message),
      ctx,
    });
    logBridgeEvent("debug", "chat final finalized run", {
      sessionKey: sk,
      runId,
    }, { channel: "chat", sessionKey: sk, runId, state });
    return;
  }

  if (state === "aborted" || state === "error") {
    if (!sk) {
      return;
    }
    if (runId) {
      const timer = ctx.pendingLifecycleFinalizeByRun.get(runId);
      if (timer) {
        clearTimeout(timer);
        ctx.pendingLifecycleFinalizeByRun.delete(runId);
      }
    }
    finalizeChatRun({
      sessionKey: sk,
      runId,
      state,
      errorMessage: payload?.errorMessage,
      ctx,
    });
    logBridgeEvent(
      state === "error" ? "warn" : "debug",
      `chat ${state} finalized run`,
      { sessionKey: sk, runId, errorMessage: payload?.errorMessage },
      { channel: "chat", sessionKey: sk, runId, state },
    );
  }
}
