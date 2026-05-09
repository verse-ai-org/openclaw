import { create } from "zustand";
import type { InteractiveSummaryPair } from "@/components/chat/types";

export type UiToolLifecycleStatus = "pending" | "submitted" | "editing" | "error";

export type UiToolLifecycleState = {
  status: UiToolLifecycleStatus;
  summary?: InteractiveSummaryPair[];
  /** Previous submitted summary preserved when entering `editing`. */
  stashedSummary?: InteractiveSummaryPair[];
  lastPayload?: unknown;
  submittedAt?: number;
  error?: string;
};

type InteractionState = {
  /**
   * Active thread id for scoping ephemeral UI state.
   *
   * We keep `uiStateById` in-memory and scoped to the current thread to avoid
   * cross-thread collisions when two threads reuse the same `uiId`.
   */
  activeThreadId?: string;
  setActiveThreadId: (threadId: string) => void;

  /**
   * Client-only ephemeral map of uiId → UI lifecycle state.
   *
   * This drives whether a Tool UI surface renders as:
   * - pending (interactive)
   * - submitted (receipt/summary)
   * - editing (re-do)
   */
  uiStateById: Record<string, UiToolLifecycleState | undefined>;
  setUiState: (uiId: string, next: UiToolLifecycleState) => void;
  setSubmitted: (uiId: string, args: { summary: InteractiveSummaryPair[]; payload?: unknown }) => void;
  setEditing: (uiId: string) => void;
  cancelEditing: (uiId: string) => void;
  clearUiState: (uiId: string) => void;

  /**
   * Back-compat alias for callers that only stored summary pairs.
   */
  interactiveSummaryById: Record<string, InteractiveSummaryPair[]>;
  setInteractiveSummary: (uiId: string, pairs: InteractiveSummaryPair[]) => void;
  clearInteractiveSummary: (uiId: string) => void;
};

export const useInteractionStore = create<InteractionState>()((set) => ({
  activeThreadId: undefined,
  uiStateById: {},
  interactiveSummaryById: {},

  setActiveThreadId: (threadId) =>
    set((state) => {
      if (state.activeThreadId === threadId) return {};
      return {
        activeThreadId: threadId,
        uiStateById: {},
        interactiveSummaryById: {},
      };
    }),

  setUiState: (uiId, next) =>
    set((state) => ({
      uiStateById: { ...state.uiStateById, [uiId]: next },
    })),

  setSubmitted: (uiId, args) =>
    set((state) => ({
      uiStateById: {
        ...state.uiStateById,
        [uiId]: {
          status: "submitted",
          summary: args.summary,
          lastPayload: args.payload,
          submittedAt: Date.now(),
        },
      },
      interactiveSummaryById: {
        ...state.interactiveSummaryById,
        [uiId]: args.summary,
      },
    })),

  setEditing: (uiId) =>
    set((state) => ({
      uiStateById: {
        ...state.uiStateById,
        [uiId]: {
          ...(state.uiStateById[uiId] ?? { status: "pending" }),
          status: "editing",
          stashedSummary:
            state.uiStateById[uiId]?.status === "submitted"
              ? state.uiStateById[uiId]?.summary
              : state.uiStateById[uiId]?.stashedSummary,
          summary: undefined,
        },
      },
      interactiveSummaryById: (() => {
        if (!(uiId in state.interactiveSummaryById)) return state.interactiveSummaryById;
        const { [uiId]: _removed, ...rest } = state.interactiveSummaryById;
        return rest;
      })(),
    })),

  cancelEditing: (uiId) =>
    set((state) => {
      const prev = state.uiStateById[uiId];
      if (!prev) return {};
      const restore = prev.stashedSummary;
      if (!restore) {
        // No stashed summary to restore; treat as clearing edit state.
        const { [uiId]: _removed, ...rest } = state.uiStateById;
        return { uiStateById: rest };
      }
      return {
        uiStateById: {
          ...state.uiStateById,
          [uiId]: {
            ...prev,
            status: "submitted",
            summary: restore,
            stashedSummary: undefined,
          },
        },
        interactiveSummaryById: {
          ...state.interactiveSummaryById,
          [uiId]: restore,
        },
      };
    }),

  clearUiState: (uiId) =>
    set((state) => {
      if (!(uiId in state.uiStateById) && !(uiId in state.interactiveSummaryById)) return {};
      const { [uiId]: _removed, ...rest } = state.uiStateById;
      const { [uiId]: _removedSummary, ...restSummary } = state.interactiveSummaryById;
      return { uiStateById: rest, interactiveSummaryById: restSummary };
    }),

  setInteractiveSummary: (uiId, pairs) =>
    set((state) => ({
      interactiveSummaryById: { ...state.interactiveSummaryById, [uiId]: pairs },
    })),

  clearInteractiveSummary: (uiId) =>
    set((state) => {
      if (!(uiId in state.interactiveSummaryById)) return {};
      const { [uiId]: _removed, ...rest } = state.interactiveSummaryById;
      return { interactiveSummaryById: rest };
    }),
}));

