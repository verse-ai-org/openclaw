import {
  commitCurrentTextAction,
  hasBufferedAssistantProjection,
  upsertInteractiveStreamAction,
  upsertToolStreamAction,
  useRunProjectionStore,
} from "@/run-projection";
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
import type { BridgeEventOutcome } from "./event-outcome";

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
): BridgeEventOutcome {
  const phase = data.phase as string | undefined;
  const shouldAccept = shouldAcceptRunEvent({
    activeRunBySession: ctx.activeRunBySession,
    sessionKey,
    runId,
    eventKind: toRunEventKindFromLifecyclePhase(phase),
  });

  if (!shouldAccept) {
    return { kind: "ignored", reason: "stale", summary: `agent.lifecycle.${phase ?? "unknown"}` };
  }

  if (phase === "start") {
    return { kind: "applied", summary: "agent.lifecycle.start" };
  }

  if (phase === "end") {
    const st = useChatStore.getState();
    const projection = useRunProjectionStore.getState();
    if (hasBufferedAssistantProjection(projection)) {
      finalizeChatRun({ sessionKey, runId, state: "final", ctx });
      return { kind: "finalized", summary: "agent.lifecycle.end.fallback_finalized" };
    }
    st.setSending(false);
    return { kind: "applied", summary: "agent.lifecycle.end" };
  }

  if (phase === "error") {
    finalizeChatRun({
      sessionKey,
      runId,
      state: "error",
      errorMessage: typeof data.error === "string" ? data.error : undefined,
      ctx,
    });
    return { kind: "finalized", summary: "agent.lifecycle.error" };
  }
  return { kind: "ignored", reason: "unhandled_state", summary: `agent.lifecycle.${phase ?? "unknown"}` };
}

function handleToolStream(
  ctx: BridgeRuntimeContext,
  sessionKey: string,
  runId: string | undefined,
  data: Record<string, unknown>,
): BridgeEventOutcome {
  const shouldAccept = shouldAcceptRunEvent({
    activeRunBySession: ctx.activeRunBySession,
    sessionKey,
    runId,
    eventKind: "progress",
  });
  
  if (!shouldAccept) {
    return { kind: "ignored", reason: "stale", summary: "agent.tool.stale" };
  }
  const phase = data.phase as string | undefined;
  const toolCallId = data.toolCallId as string | undefined;
  const toolName = data.name as string | undefined;

  if (isInteractiveToolName(toolName)) {
    if (phase === "start") {
      useRunProjectionStore.getState().dispatch(commitCurrentTextAction());
      return { kind: "applied", summary: "agent.tool.interactive.start" };
    }
    if (phase === "result") {
      const interactivePayload = extractInteractivePayload(data);
      const block = createInteractiveBlock({
        interactiveId: toolCallId ?? crypto.randomUUID(),
        kind: toolName,
        payload: interactivePayload,
      });
      if (block) {
        useRunProjectionStore.getState().dispatch(commitCurrentTextAction());
        useRunProjectionStore.getState().dispatch(upsertInteractiveStreamAction(block));
        if (runId) {
          ctx.pendingInteractiveHydrationRuns.delete(runId);
        }
        return { kind: "applied", summary: "agent.tool.interactive.result" };
      } else if (runId) {
        ctx.pendingInteractiveHydrationRuns.add(runId);
      }
      return { kind: "ignored", reason: "missing_payload_data", summary: "agent.tool.interactive.result.dropped" };
    }
    return { kind: "ignored", reason: "unhandled_state", summary: `agent.tool.interactive.${phase ?? "unknown"}` };
  }

  if (phase === "start") {
    useRunProjectionStore.getState().dispatch(commitCurrentTextAction());
    const entryId = toolCallId ?? crypto.randomUUID();
    const entry: ToolStreamEntry = {
      id: entryId,
      toolName: toolName,
      phase: "start",
      input: data.args,
    };
    useRunProjectionStore.getState().dispatch(upsertToolStreamAction(entry));
    const buffered = ctx.pendingToolResults.get(entryId);
    if (buffered) {
      ctx.pendingToolResults.delete(entryId);
      const isError = buffered.phase === "error";
      useRunProjectionStore.getState().dispatch(
        upsertToolStreamAction({
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
        }),
      );
    }
    return { kind: "applied", summary: "agent.tool.start" };
  }

  if (phase === "update") {
    const resolvedId = toolCallId ?? "";
    const existing = useRunProjectionStore.getState().toolStreamById.get(resolvedId);
    const partialOutput = data.partialResult ?? data.meta ?? data.result;
    if (existing) {
      useRunProjectionStore.getState().dispatch(
        upsertToolStreamAction({
          ...existing,
          phase: "running",
          output: partialOutput ?? existing.output,
        }),
      );
    } else if (resolvedId) {
      useRunProjectionStore.getState().dispatch(
        upsertToolStreamAction({
          id: resolvedId,
          toolName,
          phase: "running",
          output: partialOutput,
        }),
      );
    }
    return { kind: "applied", summary: "agent.tool.update" };
  }

  if (phase === "result") {
    const resolvedId = toolCallId ?? "";
    const existing = useRunProjectionStore.getState().toolStreamById.get(resolvedId);
    if (existing) {
      const isError = Boolean(data.isError);
      useRunProjectionStore.getState().dispatch(
        upsertToolStreamAction({
          ...existing,
          phase: isError ? "error" : "result",
          error:
            isError && typeof data.error === "string" ? data.error : undefined,
          output: data.meta ?? data.result ?? undefined,
        }),
      );
    } else if (resolvedId) {
      ctx.pendingToolResults.set(resolvedId, { phase: "result", data });
    }
    return { kind: "applied", summary: "agent.tool.result" };
  }

  if (phase === "error") {
    const resolvedId = toolCallId ?? "";
    const existing = useRunProjectionStore.getState().toolStreamById.get(resolvedId);
    if (existing) {
      useRunProjectionStore.getState().dispatch(
        upsertToolStreamAction({
          ...existing,
          phase: "error",
          error: (data.error as string) ?? "unknown error",
        }),
      );
    } else if (resolvedId) {
      ctx.pendingToolResults.set(resolvedId, { phase: "error", data });
    }
    return { kind: "applied", summary: "agent.tool.error" };
  }

  return { kind: "ignored", reason: "unhandled_state", summary: `agent.tool.${phase ?? "unknown"}` };
}

export function handleAgentEvent(
  ctx: BridgeRuntimeContext,
  payload: AgentEventPayload,
): BridgeEventOutcome {
  const sessionKey = normalizeSessionKey(payload.sessionKey);
  if (!isChatEventForActiveSession(payload?.sessionKey)) {
    return { kind: "ignored", reason: "inactive_session", summary: "agent.inactive_session" };
  }
  if (!sessionKey) {
    return { kind: "ignored", reason: "missing_session_key", summary: "agent.missing_session_key" };
  }
  const runId = normalizeRunId(payload.runId);
  const stream = payload?.stream as string | undefined;
  const data = payload?.data as Record<string, unknown> | undefined;
  if (!data) {
    return { kind: "ignored", reason: "missing_payload_data", summary: "agent.missing_data" };
  }
  if (stream === "lifecycle") {
    return handleLifecycleStream(ctx, sessionKey, runId, data);
  }
  if (stream === "tool") {
    return handleToolStream(ctx, sessionKey, runId, data);
  }
  return { kind: "ignored", reason: "unhandled_stream", summary: `agent.${stream ?? "unknown"}` };
}
