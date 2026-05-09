import { create } from "zustand";

interface ChatState {
  // Active session key
  sessionKey: string | null;

  messagesLoading: boolean;

  /**
   * Optimistic UI flag toggled by the frontend when the user submits a message.
   * Kept for the brief window between submit and the first WS event; cleared when
   * the canonical conversation pipeline observes a terminal run event.
   */
  sending: boolean;

  // Pending history reload: set to a session key to request a silent reload.
  pendingHistoryReloadKey: string | null;

  // Monotonic counter bumped after each completed generation to signal
  // session-manager to re-fetch the session list (so derivedTitle updates).
  pendingSessionsReloadSeq: number;

  // Last error message (shown inline in the thread)
  lastError: string | null;

  // Actions
  setSending: (v: boolean) => void;
  setMessagesLoading: (v: boolean) => void;
  setSessionKey: (key: string | null) => void;
  setPendingHistoryReloadKey: (key: string | null) => void;
  triggerSessionsReload: () => void;
  setLastError: (msg: string | null) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  messagesLoading: false,
  sending: false,
  sessionKey: null,
  pendingHistoryReloadKey: null,
  pendingSessionsReloadSeq: 0,
  lastError: null,

  setSending: (v) => set({ sending: v }),

  setMessagesLoading: (v) => set({ messagesLoading: v }),

  setSessionKey: (key) => set({ sessionKey: key }),

  setPendingHistoryReloadKey: (key) => set({ pendingHistoryReloadKey: key }),

  triggerSessionsReload: () =>
    set((state) => ({
      pendingSessionsReloadSeq: state.pendingSessionsReloadSeq + 1,
    })),

  setLastError: (msg) => set({ lastError: msg }),
}));
