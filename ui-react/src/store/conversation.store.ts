import { create } from "zustand";
import type { ChatMessage } from "@/components/chat/types";
import type {
  CanonicalChatEvent,
  CanonicalMessage,
  CanonicalRun,
  ConversationState,
  ThreadId,
} from "@/components/chat/conversation";
import { EventType } from "@/components/chat/conversation";
import { applyCanonicalEvent, emptyConversationState } from "@/components/chat/conversation";
import { beginOutboundRunForThread } from "@/components/chat/conversation/run-lifecycle";
import { chatMessagesToCanonicalSnapshot } from "@/components/chat/conversation/interop";
import type { RunId } from "@/components/chat/conversation";

export type HistoryPagingState = {
  oldestBeforeTs: number | null;
  hasMore: boolean;
  loadingOlder: boolean;
};

type ConversationStoreState = {
  byThread: Record<string, ConversationState>;
  historyPagingByThread: Record<string, HistoryPagingState>;
  applyEvents: (threadId: ThreadId, events: CanonicalChatEvent[]) => void;
  beginOutboundRun: (threadId: ThreadId, runId: RunId) => void;
  setHistorySnapshot: (threadId: ThreadId, messages: ChatMessage[], ts?: number) => void;
  setHistoryCanonicalSnapshot: (
    threadId: ThreadId,
    messages: CanonicalMessage[],
    ts?: number,
    runs?: CanonicalRun[],
  ) => void;
  setHistoryPagingState: (threadId: ThreadId, next: Partial<HistoryPagingState>) => void;
  setActiveRunSnapshot: (threadId: ThreadId, runId: string | null, startedAt?: number | null) => void;
  truncateAfter: (threadId: ThreadId, parentId: string | null) => void;
  resetThread: (threadId: ThreadId) => void;
};

export const useConversationStore = create<ConversationStoreState>()((set) => ({
  byThread: {},
  historyPagingByThread: {},

  applyEvents: (threadId, events) =>
    set((state) => {
      const prev = state.byThread[threadId] ?? emptyConversationState(threadId);
      let next = prev;
      for (const e of events) {
        next = applyCanonicalEvent(next, e);
      }
      return { byThread: { ...state.byThread, [threadId]: next } };
    }),

  beginOutboundRun: (threadId, runId) =>
    set((state) => ({
      byThread: beginOutboundRunForThread(state.byThread, threadId, runId),
    })),

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

  setHistoryCanonicalSnapshot: (threadId, messages, ts = Date.now(), runs) =>
    set((state) => {
      const prev = state.byThread[threadId] ?? emptyConversationState(threadId);
      const next = applyCanonicalEvent(prev, {
        type: EventType.MessagesSnapshot,
        threadId,
        ts,
        messages,
        ...(runs !== undefined ? { runs } : {}),
      });
      return { byThread: { ...state.byThread, [threadId]: next } };
    }),

  setHistoryPagingState: (threadId, next) =>
    set((state) => {
      const prev: HistoryPagingState =
        state.historyPagingByThread[threadId] ?? {
          oldestBeforeTs: null,
          hasMore: false,
          loadingOlder: false,
        };
      return {
        historyPagingByThread: {
          ...state.historyPagingByThread,
          [threadId]: { ...prev, ...next },
        },
      };
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
      const { [threadId]: _pagingRemoved, ...pagingRest } = state.historyPagingByThread;
      return { byThread: rest, historyPagingByThread: pagingRest };
    }),
}));
