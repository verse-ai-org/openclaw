import { create } from "zustand";
import type { ChatMessage, InteractiveSummaryPair } from "@/components/chat/types";
import { emptyRunState, type RunState } from "@/run-stream/run-state";

interface ChatState {
  // Active session key
  sessionKey: string | null;

  // History (loaded from gateway)
  messages: ChatMessage[];
  messagesLoading: boolean;

  /** Gateway run id for the active send (used by onCancel). */
  runId: string | null;

  /**
   * Live run assembly state. Non-null while a run is in progress.
   * Replaces the former runProjectionStore + sending/pendingGenerationBySession
   * as the primary "is something running?" signal.
   *
   * Set to an empty RunState immediately when the user submits (optimistic UI)
   * so isRunning=true before the first WS event arrives.
   */
  activeRunState: RunState | null;

  /**
   * Optimistic UI flag toggled by the frontend when the user submits a message.
   * Kept for the brief window between submit and the first WS event; cleared
   * once run-dispatch receives the first text.delta.
   */
  sending: boolean;

  // Pending history reload: set to a session key to request a silent reload.
  pendingHistoryReloadKey: string | null;

  // Monotonic counter bumped after each completed generation to signal
  // session-manager to re-fetch the session list (so derivedTitle updates).
  pendingSessionsReloadSeq: number;

  // Last error message (shown inline in the thread)
  lastError: string | null;

  /**
   * Pre-filled draft message for the composer — consumed once on mount and cleared.
   */
  pendingDraftMessage: string | null;

  /**
   * Backend-derived "active run" mirror keyed by `sessionKey`.
   * - Authoritative source: WS `chat` / `agent` events and refresh restore via `chat.status`.
   * - Use-cases: refresh-resume, multi-tab, switching sessions while a run continues.
   * - Cleared: terminal events or lifecycle end.
   */
  pendingGenerationBySession: Record<string, { runId?: string | null }>;

  /**
   * Client-only ephemeral map of interactiveId → submitted Q&A summary pairs.
   * Written when a user submits an interactive response; read by InteractiveParts
   * to show a QA summary card instead of the interactive component.
   */
  interactiveSummaryById: Record<string, InteractiveSummaryPair[]>;

  // Actions
  setSending: (v: boolean) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  setMessagesLoading: (v: boolean) => void;
  clearMessages: () => void;
  setSessionKey: (key: string | null) => void;
  setPendingDraftMessage: (msg: string | null) => void;
  setRunId: (id: string | null) => void;
  setActiveRunState: (s: RunState | null) => void;
  /** Appends a finalized assistant message to history. */
  commitStreamAsMessage: (msg: ChatMessage) => void;
  setPendingHistoryReloadKey: (key: string | null) => void;
  triggerSessionsReload: () => void;
  setLastError: (msg: string | null) => void;
  truncateMessagesAfter: (parentId: string | null) => void;
  markSessionGenerating: (sessionKey: string, runId?: string | null) => void;
  clearSessionGenerating: (sessionKey: string) => void;
  /** Start an optimistic run immediately on user submit (before WS events). */
  startOptimisticRun: (sessionKey: string) => void;
  setInteractiveSummary: (interactiveId: string, pairs: InteractiveSummaryPair[]) => void;
  clearInteractiveSummary: (interactiveId: string) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  messages: [],
  messagesLoading: false,
  runId: null,
  sending: false,
  sessionKey: null,
  activeRunState: null,
  pendingHistoryReloadKey: null,
  pendingSessionsReloadSeq: 0,
  lastError: null,
  pendingDraftMessage: null,
  pendingGenerationBySession: {},
  interactiveSummaryById: {},

  setSending: (v) => set({ sending: v }),

  setMessages: (msgs) => set({ messages: msgs }),
  setMessagesLoading: (v) => set({ messagesLoading: v }),

  clearMessages: () =>
    set({
      messages: [],
      runId: null,
      activeRunState: null,
    }),

  setSessionKey: (key) => set({ sessionKey: key }),
  setPendingDraftMessage: (msg) => set({ pendingDraftMessage: msg }),
  setRunId: (id) => set({ runId: id }),
  setActiveRunState: (s) => set({ activeRunState: s }),

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

  truncateMessagesAfter: (parentId) =>
    set((state) => {
      if (parentId === null) {
        return { messages: [], runId: null, activeRunState: null };
      }
      const idx = state.messages.findIndex((m) => m.id === parentId);
      if (idx === -1) return {};
      return {
        messages: state.messages.slice(0, idx + 1),
        runId: null,
        activeRunState: null,
      };
    }),

  startOptimisticRun: (sessionKey) =>
    set((state) => ({
      sending: true,
      activeRunState: state.activeRunState ?? emptyRunState(sessionKey),
    })),

  setInteractiveSummary: (interactiveId, pairs) =>
    set((state) => ({
      interactiveSummaryById: { ...state.interactiveSummaryById, [interactiveId]: pairs },
    })),

  clearInteractiveSummary: (interactiveId) =>
    set((state) => {
      if (!(interactiveId in state.interactiveSummaryById)) return {};
      const { [interactiveId]: _removed, ...rest } = state.interactiveSummaryById;
      return { interactiveSummaryById: rest };
    }),

  markSessionGenerating: (sessionKey, runId) => {
    const k = sessionKey.trim();
    if (!k) return;
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
    if (!k) return;
    set((state) => {
      if (!(k in state.pendingGenerationBySession)) return {};
      const { [k]: _removed, ...rest } = state.pendingGenerationBySession;
      return { pendingGenerationBySession: rest };
    });
  },
}));
