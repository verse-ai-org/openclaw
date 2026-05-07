import { create } from "zustand";
import { useRunProjectionStore } from "@/run-projection/store";
import type { ChatMessage } from "@/components/chat/types";

interface ChatState {
  // Active session key
  sessionKey: string | null;

  // History (loaded from gateway)
  messages: ChatMessage[];
  messagesLoading: boolean;

  /** Gateway run id for the active send (live row metadata). */
  runId: string | null;

  /**
   * Optimistic UI flag toggled by the frontend when the user submits a message.
   *
   * This is NOT the authoritative "is the gateway still running?" state.
   * For backend-derived activity (including refresh restore / multi-tab), see
   * `pendingGenerationBySession`.
   */
  sending: boolean;

  // Pending history reload: set to a session key to request a silent reload.
  // session-manager watches this and calls loadHistory when non-null.
  pendingHistoryReloadKey: string | null;

  // Monotonic counter bumped after each completed generation to signal
  // session-manager to re-fetch the session list (so derivedTitle updates).
  pendingSessionsReloadSeq: number;

  // Last error message (shown inline in the thread)
  lastError: string | null;

  /**
   * Pre-filled draft message for the composer — consumed once on mount and cleared.
   * Used by "Create With Chat" on the Scheduled Tasks page to seed the input.
   */
  pendingDraftMessage: string | null;

  /**
   * Backend-derived "active run" mirror keyed by `sessionKey`.
   *
   * - **Authoritative source**: WS `chat` / `agent` events and refresh restore via `chat.status`.
   * - **Use-cases**: refresh-resume, multi-tab, switching sessions while a run continues.
   * - **Cleared**: terminal `chat` events (`final` / `error` / `aborted`) or lifecycle end.
   */
  pendingGenerationBySession: Record<string, { runId?: string | null }>;

  // Actions
  setSending: (v: boolean) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  setMessagesLoading: (v: boolean) => void;
  clearMessages: () => void;
  setSessionKey: (key: string | null) => void;
  setPendingDraftMessage: (msg: string | null) => void;
  setRunId: (id: string | null) => void;
  /** Appends a finalized assistant message; caller resets `useRunProjectionStore` when needed. */
  commitStreamAsMessage: (msg: ChatMessage) => void;
  setPendingHistoryReloadKey: (key: string | null) => void;
  triggerSessionsReload: () => void;
  setLastError: (msg: string | null) => void;
  truncateMessagesAfter: (parentId: string | null) => void;
  markSessionGenerating: (sessionKey: string, runId?: string | null) => void;
  clearSessionGenerating: (sessionKey: string) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  messages: [],
  messagesLoading: false,
  runId: null,
  sending: false,
  sessionKey: null,
  pendingHistoryReloadKey: null,
  pendingSessionsReloadSeq: 0,
  lastError: null,
  pendingDraftMessage: null,
  pendingGenerationBySession: {},

  setSending: (v) => set({ sending: v }),

  setMessages: (msgs) => set({ messages: msgs }),
  setMessagesLoading: (v) => set({ messagesLoading: v }),
  clearMessages: () => {
    useRunProjectionStore.getState().reset();
    set({
      messages: [],
      runId: null,
    });
  },
  setSessionKey: (key) => set({ sessionKey: key }),
  setPendingDraftMessage: (msg) => set({ pendingDraftMessage: msg }),

  setRunId: (id) => set({ runId: id }),

  commitStreamAsMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages, msg],
    })),

  setPendingHistoryReloadKey: (key) => set({ pendingHistoryReloadKey: key }),
  triggerSessionsReload: () =>
    set((state) => ({
      pendingSessionsReloadSeq: state.pendingSessionsReloadSeq + 1,
    })),

  setLastError: (msg) => set({ lastError: msg }),

  truncateMessagesAfter: (parentId) => {
    useRunProjectionStore.getState().reset();
    set((state) => {
      if (parentId === null) {
        return {
          messages: [],
          runId: null,
        };
      }
      const idx = state.messages.findIndex((m) => m.id === parentId);
      if (idx === -1) {
        return {};
      }
      return {
        messages: state.messages.slice(0, idx + 1),
        runId: null,
      };
    });
  },

  markSessionGenerating: (sessionKey, runId) => {
    const k = sessionKey.trim();
    if (!k) {
      return;
    }
    set((state) => {
      const prev = state.pendingGenerationBySession[k];
      const nextRunId =
        typeof runId === "string" && runId.trim() ? runId.trim() : prev?.runId;
      return {
        pendingGenerationBySession: {
          ...state.pendingGenerationBySession,
          [k]: { runId: nextRunId },
        },
      };
    });
  },

  clearSessionGenerating: (sessionKey) => {
    const k = sessionKey.trim();
    if (!k) {
      return;
    }
    set((state) => {
      if (!(k in state.pendingGenerationBySession)) {
        return {};
      }
      const { [k]: _removed, ...rest } = state.pendingGenerationBySession;
      return { pendingGenerationBySession: rest };
    });
  },
}));
