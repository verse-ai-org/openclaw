import { useChatStore, type ToolStreamEntry } from "@/store/chat.store";
import { isChatEventForActiveSession } from "../session-scope";
import {
  normalizeRunId,
  normalizeSessionKey,
  shouldAcceptRunEvent,
} from "../run-guard";
import {
  finalizeChatRun,
  toRunEventKindFromLifecyclePhase,
  type BridgeRuntimeContext,
} from "./shared";
import { logBridgeEvent } from "./bridge-debug";

export type AgentEventPayload = {
  stream?: string;
  sessionKey?: string;
  runId?: string;
  data?: unknown;
};

function handleLifecycleStream(
  ctx: BridgeRuntimeContext,
  sessionKey: string,
  runId: string | undefined,
  data: Record<string, unknown>,
) {
  const phase = data.phase as string | undefined;
  if (
    !shouldAcceptRunEvent({
      activeRunBySession: ctx.activeRunBySession,
      sessionKey,
      runId,
      eventKind: toRunEventKindFromLifecyclePhase(phase),
    })
  ) {
    logBridgeEvent("warn", "drop stale lifecycle event", {
      phase,
      sessionKey,
      runId,
      activeRunId: ctx.activeRunBySession.get(sessionKey),
    }, { channel: "agent.lifecycle", sessionKey, runId, phase });
    return;
  }

  if (phase === "start") {
    useChatStore.getState().markSessionGenerating(sessionKey, runId);
    logBridgeEvent("debug", "lifecycle start marked generating", {
      sessionKey,
      runId,
    }, { channel: "agent.lifecycle", sessionKey, runId, phase });
    return;
  }
  if (phase === "end") {
    const st = useChatStore.getState();
    if (
      st.pendingGenerationBySession[sessionKey] &&
      (st.stream !== null ||
        st.committedBlocks.length > 0 ||
        st.toolStreamOrder.length > 0 ||
        st.interactiveStreamOrder.length > 0)
    ) {
      finalizeChatRun({
        sessionKey,
        runId,
        state: "final",
        ctx,
      });
      logBridgeEvent("warn", "lifecycle end fallback finalized run", {
        sessionKey,
        runId,
      }, { channel: "agent.lifecycle", sessionKey, runId, phase });
    } else {
      st.clearSessionGenerating(sessionKey);
      logBridgeEvent("debug", "lifecycle end cleared generating", {
        sessionKey,
        runId,
      }, { channel: "agent.lifecycle", sessionKey, runId, phase });
    }
    return;
  }
  if (phase === "error") {
    finalizeChatRun({
      sessionKey,
      runId,
      state: "error",
      errorMessage: typeof data.error === "string" ? data.error : undefined,
      ctx,
    });
    logBridgeEvent("warn", "lifecycle error finalized run", {
      sessionKey,
      runId,
      error: data.error,
    }, { channel: "agent.lifecycle", sessionKey, runId, phase });
  }
}

function handleToolStream(
  ctx: BridgeRuntimeContext,
  sessionKey: string,
  runId: string | undefined,
  data: Record<string, unknown>,
) {
  const phase = data.phase as string | undefined;
  const eventKind = phase === "start" ? "start" : "progress";
  if (
    !shouldAcceptRunEvent({
      activeRunBySession: ctx.activeRunBySession,
      sessionKey,
      runId,
      eventKind,
    })
  ) {
    logBridgeEvent("warn", "drop stale tool event", {
      phase: data.phase,
      sessionKey,
      runId,
      activeRunId: ctx.activeRunBySession.get(sessionKey),
    }, {
      channel: "agent.tool",
      sessionKey,
      runId,
      phase: typeof data.phase === "string" ? data.phase : undefined,
    });
    return;
  }
  useChatStore.getState().markSessionGenerating(sessionKey, runId);
  const toolCallId = data.toolCallId as string | undefined;
  const toolName = data.name as string | undefined;

  // NOTE: Interactive widgets (question_flow / option_list) used to be routed
  // here as a tool-call special case. They now live on their own
  // `stream="interaction"` event (see `handleInteractionStream`), so this
  // function only handles plain tool calls.

  if (phase === "start") {
    useChatStore.getState().commitCurrentText();
    const entryId = toolCallId ?? crypto.randomUUID();
    const entry: ToolStreamEntry = {
      id: entryId,
      toolName: toolName,
      phase: "start",
      input: data.args,
    };
    useChatStore.getState().upsertToolStream(entry);
    logBridgeEvent("debug", "tool start upserted", {
      toolCallId: entryId,
      toolName,
      sessionKey,
      runId,
    }, { channel: "agent.tool", sessionKey, runId, phase });
    const buffered = ctx.pendingToolResults.get(entryId);
    if (buffered) {
      ctx.pendingToolResults.delete(entryId);
      const isError = buffered.phase === "error";
      useChatStore.getState().upsertToolStream({
        ...entry,
        phase: isError ? "error" : "result",
        error: isError
          ? typeof buffered.data.error === "string"
            ? buffered.data.error
            : "unknown error"
          : undefined,
        output: isError
          ? undefined
          : (buffered.data.meta ?? buffered.data.result ?? undefined),
      });
      logBridgeEvent("debug", "applied buffered tool terminal event", {
        toolCallId: entryId,
        phase: buffered.phase,
      }, { channel: "agent.tool", sessionKey, runId, phase: buffered.phase });
    }
    return;
  }

  if (phase === "result") {
    const resolvedId = toolCallId ?? "";
    const existing = useChatStore.getState().toolStreamById.get(resolvedId);
    if (existing) {
      const isError = Boolean(data.isError);
      useChatStore.getState().upsertToolStream({
        ...existing,
        phase: isError ? "error" : "result",
        error:
          isError && typeof data.error === "string" ? data.error : undefined,
        output: data.meta ?? data.result ?? undefined,
      });
      logBridgeEvent("debug", "tool result merged", {
        toolCallId: resolvedId,
        isError,
      }, { channel: "agent.tool", sessionKey, runId, phase });
    } else if (resolvedId) {
      ctx.pendingToolResults.set(resolvedId, { phase: "result", data });
      logBridgeEvent("debug", "buffered tool result before start", {
        toolCallId: resolvedId,
      }, { channel: "agent.tool", sessionKey, runId, phase });
    }
    return;
  }

  if (phase === "error") {
    const resolvedId = toolCallId ?? "";
    const existing = useChatStore.getState().toolStreamById.get(resolvedId);
    if (existing) {
      useChatStore.getState().upsertToolStream({
        ...existing,
        phase: "error",
        error: (data.error as string) ?? "unknown error",
      });
      logBridgeEvent("warn", "tool error merged", {
        toolCallId: resolvedId,
        error: data.error,
      }, { channel: "agent.tool", sessionKey, runId, phase });
    } else if (resolvedId) {
      ctx.pendingToolResults.set(resolvedId, { phase: "error", data });
      logBridgeEvent("debug", "buffered tool error before start", {
        toolCallId: resolvedId,
      }, { channel: "agent.tool", sessionKey, runId, phase });
    }
    return;
  }

  if (phase === "update") {
    const resolvedId = toolCallId ?? "";
    const existing = useChatStore.getState().toolStreamById.get(resolvedId);
    const partialOutput = data.partialResult ?? data.meta ?? data.result;
    if (existing) {
      useChatStore.getState().upsertToolStream({
        ...existing,
        phase: "running",
        output: partialOutput ?? existing.output,
      });
      logBridgeEvent(
        "debug",
        "tool update merged",
        { toolCallId: resolvedId },
        { channel: "agent.tool", sessionKey, runId, phase },
      );
    } else if (resolvedId) {
      useChatStore.getState().upsertToolStream({
        id: resolvedId,
        toolName,
        phase: "running",
        output: partialOutput,
      });
      logBridgeEvent("debug", "tool update upserted without start", {
        toolCallId: resolvedId,
      }, { channel: "agent.tool", sessionKey, runId, phase });
    }
  }
}

export function handleAgentEvent(
  ctx: BridgeRuntimeContext,
  payload: AgentEventPayload,
) {
  const sessionKey = normalizeSessionKey(payload.sessionKey);
  if (!isChatEventForActiveSession(payload?.sessionKey)) {
    logBridgeEvent("debug", "skip agent event for inactive session", {
      stream: payload.stream,
      sessionKey: payload.sessionKey,
      runId: payload.runId,
    }, {
      channel:
        payload.stream === "lifecycle" ? "agent.lifecycle" : "agent.tool",
      runId: normalizeRunId(payload.runId),
    });
    return;
  }
  if (!sessionKey) {
    return;
  }
  const runId = normalizeRunId(payload.runId);
  const stream = payload?.stream as string | undefined;
  const data = payload?.data as Record<string, unknown> | undefined;
  if (!data) {
    return;
  }
  if (stream === "lifecycle") {
    handleLifecycleStream(ctx, sessionKey, runId, data);
    return;
  }
  if (stream === "tool") {
    handleToolStream(ctx, sessionKey, runId, data);
    return;
  }
  if (stream === "interaction") {
    handleInteractionStream(ctx, sessionKey, runId, data);
  }
}

/**
 * New first-class interaction protocol (replaces the tool-based `question_flow`
 * / `option_list` path). Events arrive on `stream="interaction"` with two
 * phases:
 * - `phase="request"`: the LLM emitted an `<ask>` tag. We record the request
 *   in the `interactions` slice and — critically — commit the current text
 *   and append a content-part marker so the ordering between prose and the
 *   interactive widget is preserved once the turn finalizes.
 * - `phase="response"`: the user (or channel downgrade) submitted or cancelled
 *   the interaction; we flip the status + attach the response payload.
 */
function handleInteractionStream(
  ctx: BridgeRuntimeContext,
  sessionKey: string,
  runId: string | undefined,
  data: Record<string, unknown>,
) {
  const phase = data.phase as string | undefined;
  const activeRunId = ctx.activeRunBySession.get(sessionKey);
  if (phase === "request") {
    const interactionId = typeof data.interactionId === "string" ? data.interactionId : "";
    const component = typeof data.component === "string" ? data.component : "";
    if (!interactionId || !component) return;
    if (
      !shouldAcceptRunEvent({
        activeRunBySession: ctx.activeRunBySession,
        sessionKey,
        runId,
        eventKind: "start",
      })
    ) {
      logBridgeEvent(
        "warn",
        "drop stale interaction request (run guard)",
        { interactionId, component, eventRunId: runId, activeRunId },
        { channel: "agent.interaction", sessionKey, runId, phase: "request" },
      );
      return;
    }
    useChatStore.getState().markSessionGenerating(sessionKey, runId);
    useChatStore.getState().commitCurrentText();
    useChatStore.getState().upsertInteraction({
      interactionId,
      component,
      payload: data.payload,
      schemaVersion:
        typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
      cancellable:
        typeof data.cancellable === "boolean" ? data.cancellable : undefined,
    });
    logBridgeEvent(
      "debug",
      "interaction request upserted",
      {
        interactionId,
        component,
        sessionKey,
        runId,
        activeRunIdAfter: ctx.activeRunBySession.get(sessionKey),
      },
      { channel: "agent.interaction", sessionKey, runId, phase: "request" },
    );
    return;
  }
  if (phase === "response") {
    const interactionId = typeof data.interactionId === "string" ? data.interactionId : "";
    if (!interactionId) return;
    const status = (data.status as string | undefined) ?? "submitted";
    useChatStore.getState().setInteractionResponse(interactionId, {
      status: status === "cancelled" || status === "timed_out" ? status : "submitted",
      response: data.data,
      responseBy:
        data.responseBy && typeof data.responseBy === "object"
          ? (data.responseBy as { userId?: string; channel?: string })
          : undefined,
    });
    logBridgeEvent(
      "debug",
      "interaction response set (server confirmed)",
      {
        interactionId,
        status,
        sessionKey,
        eventRunId: runId,
        activeRunId,
      },
      { channel: "agent.interaction", sessionKey, runId, phase: "response" },
    );
  }
}
