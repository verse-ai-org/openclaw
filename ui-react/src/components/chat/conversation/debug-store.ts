import { create } from "zustand";
import type { CanonicalChatEvent, ConversationState, ThreadId } from "./types";
import { applyCanonicalEvent, emptyConversationState } from "./reducer";

type DebugConversationState = {
  byThread: Record<string, ConversationState>;
  appendEvents: (threadId: ThreadId, events: CanonicalChatEvent[]) => void;
  resetThread: (threadId: ThreadId) => void;
};

/**
 * Phase-1 parallel store.
 *
 * This intentionally does NOT power UI yet. It allows us to validate the
 * canonical event/reducer pipeline in production without coupling to gateway
 * or rewriting chat.store in one shot.
 */
export const useDebugConversationStore = create<DebugConversationState>()((set) => ({
  byThread: {},
  appendEvents: (threadId, events) =>
    set((state) => {
      const prev = state.byThread[threadId] ?? emptyConversationState(threadId);
      let next = prev;
      for (const e of events) {
        next = applyCanonicalEvent(next, e);
      }
      return { byThread: { ...state.byThread, [threadId]: next } };
    }),
  resetThread: (threadId) =>
    set((state) => {
      if (!(threadId in state.byThread)) return {};
      const { [threadId]: _removed, ...rest } = state.byThread;
      return { byThread: rest };
    }),
}));

