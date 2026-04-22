import {
  useChatStore,
  toolStreamEntryToResultText,
  type ChatMessage,
  type ContentBlock,
} from "@/store/chat.store";
import type { RunEventKind } from "../run-guard";

export type BridgeRuntimeContext = {
  pendingInteractiveHydrationRuns: Set<string>;
  pendingToolResults: Map<
    string,
    { phase: "result" | "error"; data: Record<string, unknown> }
  >;
  activeRunBySession: Map<string, string>;
  pendingLifecycleFinalizeByRun: Map<string, ReturnType<typeof setTimeout>>;
};

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
}): ChatMessage {
  const now = params.nowMs ?? Date.now();
  const storeState = useChatStore.getState();
  const {
    committedBlocks,
    toolStreamById,
    toolStreamOrder,
    interactiveStreamById,
    interactiveStreamOrder,
  } = storeState;

  const hasToolCalls = toolStreamOrder.length > 0;
  const hasInteractive = interactiveStreamOrder.length > 0;
  const hasCommitted = committedBlocks.length > 0;
  const committedText = committedBlocks
    .filter((block): block is Extract<ContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("");
  const trailingText =
    committedText && params.text.startsWith(committedText)
      ? params.text.slice(committedText.length)
      : params.text;

  if (!hasToolCalls && !hasInteractive && !hasCommitted) {
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      content: params.text,
      ts: now,
      runId: params.runId,
    };
  }

  const contentBlocks: ContentBlock[] = [...committedBlocks];
  for (const id of interactiveStreamOrder) {
    const entry = interactiveStreamById.get(id);
    if (!entry) {
      continue;
    }
    contentBlocks.push(entry);
  }
  for (const id of toolStreamOrder) {
    const entry = toolStreamById.get(id);
    if (!entry) {
      continue;
    }
    contentBlocks.push({
      type: "tool-call",
      toolCallId: entry.id,
      toolName: entry.toolName ?? "tool",
      argsText:
        entry.input != null
          ? JSON.stringify(entry.input, null, 2)
          : undefined,
      result: toolStreamEntryToResultText(entry),
      phase: toToolCallBlockPhase(entry.phase),
    });
  }
  if (trailingText.trim()) {
    contentBlocks.push({ type: "text", text: trailingText });
  }

  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: params.text,
    ts: now,
    runId: params.runId,
    contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
  };
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
  const st = useChatStore.getState();
  st.clearSessionGenerating(sessionKey);
  const shouldHydrateAfterFinal =
    typeof runId === "string" && runId.startsWith("interaction-resume-");
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
    } else if (st.stream !== null || st.committedBlocks.length > 0) {
      st.finalizeStream();
    } else {
      st.resetStream();
      st.setPendingHistoryReloadKey(sessionKey);
    }
    st.setSending(false);
    st.setRunId(null);
    st.triggerSessionsReload();
    if (shouldHydrateAfterFinal) {
      st.setPendingHistoryReloadKey(sessionKey);
    }
    return;
  }

  st.resetStream();
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
