/**
 * Bridge **terminal** seam: live assistant assembly is `run-projection` +
 * handlers; this file owns run completion (append assistant rows, projection
 * reset, pending generation, errors) via `finalizeChatRun` / `buildFinalAssistantMessage`.
 */
import { useChatStore } from "@/store/chat.store";
import {
  buildFinalAssistantMessageFromProjection,
  finalizeProjectionToAssistantMessage,
  hasBufferedAssistantProjection,
  useRunProjectionStore,
} from "@/run-projection";
import type { RunEventKind } from "@/components/chat/gateway/run-guard";
import type { BridgeRuntimeContext } from "@/components/chat/types";

export function toRunEventKindFromChatState(state: string | undefined): RunEventKind {
  return state === "final" || state === "error" || state === "aborted"
    ? "terminal"
    : "progress";
}

export function toRunEventKindFromLifecyclePhase(
  phase: string | undefined,
): RunEventKind {
  if (phase === "start") {
    return "start";
  }
  if (phase === "end" || phase === "error") {
    return "terminal";
  }
  return "progress";
}

export function toToolCallBlockPhase(
  phase: "start" | "running" | "result" | "error",
): "call" | "result" | "error" {
  if (phase === "result") {
    return "result";
  }
  if (phase === "error") {
    return "error";
  }
  return "call";
}

export function buildFinalAssistantMessage(params: {
  text: string;
  runId?: string;
  nowMs?: number;
}) {
  const projection = useRunProjectionStore.getState();
  return buildFinalAssistantMessageFromProjection({
    projection,
    text: params.text,
    runId: params.runId,
    nowMs: params.nowMs,
  });
}

export function finalizeChatRun(params: {
  sessionKey: string;
  runId?: string;
  state: "final" | "error" | "aborted";
  messageText?: string;
  errorMessage?: string;
  ctx: BridgeRuntimeContext;
}) {
  const { sessionKey, runId, state, messageText, errorMessage, ctx } = params;
  if (runId) {
    const finalizedRunId = ctx.finalizedRunBySession.get(sessionKey);
    if (finalizedRunId === runId) {
      return;
    }
    ctx.finalizedRunBySession.set(sessionKey, runId);
  }
  const st = useChatStore.getState();
  const projection = useRunProjectionStore.getState();
  st.clearSessionGenerating(sessionKey);
  if (runId && ctx.pendingInteractiveHydrationRuns.has(runId)) {
    st.setPendingHistoryReloadKey(sessionKey);
    ctx.pendingInteractiveHydrationRuns.delete(runId);
  }
  ctx.activeRunBySession.delete(sessionKey);

  if (state === "final") {
    const text = messageText ?? "";
    if (text) {
      const finalMsg = buildFinalAssistantMessage({ text, runId });
      st.commitStreamAsMessage(finalMsg);
      useRunProjectionStore.getState().reset();
    } else if (hasBufferedAssistantProjection(projection)) {
      const msg = finalizeProjectionToAssistantMessage(projection, st.runId);
      if (msg) {
        st.commitStreamAsMessage(msg);
      }
      useRunProjectionStore.getState().reset();
    } else {
      useRunProjectionStore.getState().reset();
      st.setPendingHistoryReloadKey(sessionKey);
    }
    st.setSending(false);
    st.setRunId(null);
    st.triggerSessionsReload();
    return;
  }

  useRunProjectionStore.getState().reset();
  st.setSending(false);
  st.setRunId(null);
  if (state === "error") {
    const errMsg =
      errorMessage && errorMessage.trim()
        ? errorMessage
        : "Generation failed. Please try again.";
    st.setLastError(errMsg);
  }
}
