import {
  useChatStore,
  toolStreamEntryToResultText,
  type ChatMessage,
  type ContentBlock,
} from "@/store/chat.store";
import { hoistAskTagsInContentBlocks } from "@/providers/chat/ask-tag-split";
import { logChatDebug } from "@/lib/chat-debug";
import type { RunEventKind } from "../run-guard";

export type BridgeRuntimeContext = {
  pendingInteractiveHydrationRuns: Set<string>;
  pendingToolResults: Map<
    string,
    { phase: "result" | "error"; data: Record<string, unknown> }
  >;
  activeRunBySession: Map<string, string>;
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
  if (params.text.trim()) {
    contentBlocks.push({ type: "text", text: params.text });
  }

  // Hoist `<ask ...>...</ask>` tags out of any text block so the persisted
  // message renders the interactive widget rather than raw XML.
  const normalizedBlocks = hoistAskTagsInContentBlocks(contentBlocks);

  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: params.text,
    ts: now,
    runId: params.runId,
    contentBlocks:
      normalizedBlocks && normalizedBlocks.length > 0
        ? normalizedBlocks
        : undefined,
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
  const snapshot = {
    streamLen: st.stream?.length ?? 0,
    committedBlocks: st.committedBlocks.length,
    toolStreamCount: st.toolStreamOrder.length,
    interactiveStreamCount: st.interactiveStreamOrder.length,
    messageTextLen: (messageText ?? "").length,
    storeRunId: st.runId,
    pendingHydrationForRun: runId
      ? ctx.pendingInteractiveHydrationRuns.has(runId)
      : false,
  };
  logChatDebug(
    "debug",
    "finalizeChatRun: enter",
    { state, ...snapshot },
    { channel: "chat.finalize", sessionKey, runId },
  );
  st.clearSessionGenerating(sessionKey);
  if (runId && ctx.pendingInteractiveHydrationRuns.has(runId)) {
    st.setPendingHistoryReloadKey(sessionKey);
    ctx.pendingInteractiveHydrationRuns.delete(runId);
  }
  ctx.activeRunBySession.delete(sessionKey);

  if (state === "final") {
    const text = messageText ?? "";
    const hasStreamBuffers =
      st.stream !== null || st.committedBlocks.length > 0;
    const hasToolOrLegacyInteractive =
      st.toolStreamOrder.length > 0 || st.interactiveStreamOrder.length > 0;
    if (text) {
      logChatDebug(
        "debug",
        "finalizeChatRun: branch commitStreamAsMessage (chat payload text)",
        {
          textPreview: text.slice(0, 120),
          toolStreamCount: st.toolStreamOrder.length,
        },
        { channel: "chat.finalize", sessionKey, runId },
      );
      const finalMsg = buildFinalAssistantMessage({ text, runId });
      st.commitStreamAsMessage(finalMsg);
    } else if (hasStreamBuffers || hasToolOrLegacyInteractive) {
      logChatDebug(
        "debug",
        hasStreamBuffers
          ? "finalizeChatRun: branch finalizeStream (stream/commit buffers ± tools)"
          : "finalizeChatRun: branch finalizeStream (tools/interactive only — e.g. turn ends on <ask> after tools)",
        { hasStreamBuffers, hasToolOrLegacyInteractive },
        { channel: "chat.finalize", sessionKey, runId },
      );
      st.finalizeStream(runId);
    } else {
      const floatingInteractions = Object.values(st.interactions).filter(
        (i) => i.status === "pending" && !i.messageId,
      );
      if (floatingInteractions.length > 0 && runId) {
        floatingInteractions.sort((a, b) => a.createdAt - b.createdAt);
        const interactionBlocks: ContentBlock[] = floatingInteractions.map(
          (i) => ({
            type: "interaction",
            interactionId: i.interactionId,
          }),
        );
        const msg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "",
          ts: Date.now(),
          runId,
          contentBlocks: interactionBlocks,
        };
        logChatDebug(
          "debug",
          "finalizeChatRun: branch commitStreamAsMessage (floating <ask> only — interaction_continue)",
          {
            interactionIds: floatingInteractions.map((i) => i.interactionId),
          },
          { channel: "chat.finalize", sessionKey, runId },
        );
        st.commitStreamAsMessage(msg);
      } else {
        const alreadyMerged =
          Boolean(runId) &&
          st.messages.some(
            (m) => m.role === "assistant" && m.runId === runId,
          );
        logChatDebug(
          "debug",
          alreadyMerged
            ? "finalizeChatRun: branch empty terminal (duplicate lifecycle+chat final — skip history reload)"
            : "finalizeChatRun: branch resetStream + pendingHistoryReload (nothing to merge locally)",
          { ...snapshot, runId, alreadyMerged },
          { channel: "chat.finalize", sessionKey, runId, state: "final" },
        );
        st.resetStream();
        if (!alreadyMerged) {
          st.setPendingHistoryReloadKey(sessionKey);
        }
      }
    }
    st.setSending(false);
    st.setRunId(null);
    st.triggerSessionsReload();
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
