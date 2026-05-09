import { create } from "zustand";
import type { ChatMessage } from "@/components/chat/types";
import type { CanonicalChatEvent, CanonicalMessage, ConversationState, ThreadId } from "@/components/chat/conversation";
import { EventType } from "@/components/chat/conversation";
import { applyCanonicalEvent, emptyConversationState } from "@/components/chat/conversation";
import { chatMessagesToCanonicalSnapshot } from "@/components/chat/conversation/interop";
import { logChatDebug } from "@/components/chat/utils/chat-debug";

type ConversationStoreState = {
  byThread: Record<string, ConversationState>;
  applyEvents: (threadId: ThreadId, events: CanonicalChatEvent[]) => void;
  setHistorySnapshot: (threadId: ThreadId, messages: ChatMessage[], ts?: number) => void;
  setHistoryCanonicalSnapshot: (threadId: ThreadId, messages: CanonicalMessage[], ts?: number) => void;
  setActiveRunSnapshot: (threadId: ThreadId, runId: string | null, startedAt?: number | null) => void;
  truncateAfter: (threadId: ThreadId, parentId: string | null) => void;
  resetThread: (threadId: ThreadId) => void;
};

function committedTextPrefix(state: ConversationState, messageId: string): string {
  const msg = state.messagesById.get(messageId);
  if (!msg) return "";
  return msg.parts
    .filter((p): p is Extract<(typeof msg.parts)[number], { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
}

export const useConversationStore = create<ConversationStoreState>()((set) => ({
  byThread: {},

  applyEvents: (threadId, events) =>
    set((state) => {
      const prev = state.byThread[threadId] ?? emptyConversationState(threadId);
      let next = prev;
      for (const e of events) {
        if (e.type === EventType.MessageSetLiveText) {
          const committed = committedTextPrefix(next, e.messageId);
          // console.log("committed", committed, e.fullText);
          const ok = e.fullText.startsWith(committed);
          if (!ok) {
            logChatDebug(
              "warn",
              "chat snapshot mismatch; reducer will reset message text",
              { committedPrefixLen: committed.length, fullTextLen: e.fullText.length },
              { channel: "projection", sessionKey: threadId, runId: e.messageId.startsWith("run:") ? e.messageId.slice(4) : undefined },
            );
          }
        }
        next = applyCanonicalEvent(next, e);
        // console.log("next", next);
      }
      return { byThread: { ...state.byThread, [threadId]: next } };
    }),

  setHistorySnapshot: (threadId, messages, ts = Date.now()) =>
    set((state) => {
      const prev = state.byThread[threadId] ?? emptyConversationState(threadId);
      const canonicalMessages = chatMessagesToCanonicalSnapshot(messages);
      const next = applyCanonicalEvent(prev, {
        type: EventType.MessagesSnapshot,
        threadId,
        ts,
        messages: canonicalMessages,
      });
      return { byThread: { ...state.byThread, [threadId]: next } };
    }),

  setHistoryCanonicalSnapshot: (threadId, messages, ts = Date.now()) =>
    set((state) => {
      const prev = state.byThread[threadId] ?? emptyConversationState(threadId);
      const next = applyCanonicalEvent(prev, {
        type: EventType.MessagesSnapshot,
        threadId,
        ts,
        messages,
      });
      return { byThread: { ...state.byThread, [threadId]: next } };
    }),

  setActiveRunSnapshot: (threadId, runId, startedAt) =>
    set((state) => {
      const prev = state.byThread[threadId] ?? emptyConversationState(threadId);
      const next = applyCanonicalEvent(prev, {
        type: EventType.RunActiveSnapshot,
        threadId,
        ts: Date.now(),
        runId: runId && runId.trim() ? runId.trim() : null,
        startedAt,
      });
      return { byThread: { ...state.byThread, [threadId]: next } };
    }),

  truncateAfter: (threadId, parentId) =>
    set((state) => {
      const prev = state.byThread[threadId];
      if (!prev) return {};
      if (parentId === null) {
        return { byThread: { ...state.byThread, [threadId]: emptyConversationState(threadId) } };
      }
      const idx = prev.messageOrder.findIndex((id) => id === parentId);
      if (idx < 0) return {};
      const keepIds = prev.messageOrder.slice(0, idx + 1);
      const messagesById = new Map(prev.messagesById);
      for (const id of prev.messageOrder.slice(idx + 1)) {
        messagesById.delete(id);
      }
      // Also drop any tool part index entries that point at removed messages.
      const toolPartIndex = new Map(prev.toolPartIndex);
      for (const [toolId, where] of toolPartIndex) {
        if (!messagesById.has(where.messageId)) {
          toolPartIndex.delete(toolId);
        }
      }
      // Clear active run if its assistant message was truncated away.
      const activeRunId = prev.activeRunId;
      const activeRun =
        activeRunId && prev.runsById.has(activeRunId) ? prev.runsById.get(activeRunId) : undefined;
      const nextActiveRunId =
        activeRun?.assistantMessageId && messagesById.has(activeRun.assistantMessageId)
          ? activeRunId
          : undefined;
      return {
        byThread: {
          ...state.byThread,
          [threadId]: {
            ...prev,
            messagesById,
            messageOrder: keepIds,
            toolPartIndex,
            activeRunId: nextActiveRunId,
          },
        },
      };
    }),

  resetThread: (threadId) =>
    set((state) => {
      if (!(threadId in state.byThread)) return {};
      const { [threadId]: _removed, ...rest } = state.byThread;
      return { byThread: rest };
    }),
}));
