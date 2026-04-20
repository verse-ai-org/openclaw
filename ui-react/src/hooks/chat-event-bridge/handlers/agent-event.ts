import { useChatStore, type ToolStreamEntry } from "@/store/chat.store";
import { createInteractiveBlock, isInteractiveToolName } from "../interactive-blocks";
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

function extractInteractivePayload(data: Record<string, unknown>): unknown {
  const candidate = data.result ?? data.meta ?? data.args;
  if (typeof candidate === "string") {
    return candidate;
  }
  if (!candidate || typeof candidate !== "object") {
    return candidate;
  }
  if (!Array.isArray((candidate as { content?: unknown }).content)) {
    return candidate;
  }
  const content = (candidate as { content: unknown[] }).content;
  const text = content
    .filter(
      (entry): entry is { type: "text"; text: string } =>
        !!entry &&
        typeof entry === "object" &&
        (entry as { type?: unknown }).type === "text" &&
        typeof (entry as { text?: unknown }).text === "string",
    )
    .map((entry) => entry.text.trim())
    .filter(Boolean)
    .join("\n");
  return text || candidate;
}

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
  if (
    !shouldAcceptRunEvent({
      activeRunBySession: ctx.activeRunBySession,
      sessionKey,
      runId,
      eventKind: "progress",
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
  const phase = data.phase as string | undefined;
  const toolCallId = data.toolCallId as string | undefined;
  const toolName = data.name as string | undefined;

  if (isInteractiveToolName(toolName)) {
    if (phase === "start") {
      useChatStore.getState().commitCurrentText();
    } else if (phase === "result") {
      const interactivePayload = extractInteractivePayload(data);
      const block = createInteractiveBlock({
        interactiveId: toolCallId ?? crypto.randomUUID(),
        kind: toolName,
        payload: interactivePayload,
      });
      if (import.meta.env.DEV && !block) {
        logBridgeEvent("warn", "dropped interactive payload", {
          toolName,
          toolCallId,
          phase,
          interactivePayload,
        }, { channel: "agent.tool", sessionKey, runId, phase });
      }
      if (block) {
        useChatStore.getState().commitCurrentText();
        useChatStore.getState().upsertInteractiveStream(block);
        if (runId) {
          ctx.pendingInteractiveHydrationRuns.delete(runId);
        }
        logBridgeEvent("debug", "interactive block upserted", {
          toolName,
          toolCallId,
          sessionKey,
          runId,
        }, { channel: "agent.tool", sessionKey, runId, phase });
      } else if (runId) {
        ctx.pendingInteractiveHydrationRuns.add(runId);
      }
    }
    return;
  }

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
  }
}
