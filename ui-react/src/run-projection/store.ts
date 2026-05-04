import { create } from "zustand";
import { emptyRunProjectionState, runProjectionReducer } from "./reducer";
import type { RunProjectionAction, RunProjectionState } from "./types";
import { logChatDebug } from "@/lib/chat-debug";

type RunProjectionStore = RunProjectionState & {
  dispatch: (action: RunProjectionAction) => void;
  reset: () => void;
};

function sliceProjection(s: RunProjectionStore): RunProjectionState {
  return {
    liveCumulativeText: s.liveCumulativeText,
    committedBlocks: s.committedBlocks,
    toolStreamById: s.toolStreamById,
    toolStreamOrder: s.toolStreamOrder,
    interactiveStreamById: s.interactiveStreamById,
    interactiveStreamOrder: s.interactiveStreamOrder,
    interactiveSummaryById: s.interactiveSummaryById,
  };
}

export const useRunProjectionStore = create<RunProjectionStore>((set) => ({
  ...emptyRunProjectionState(),
  dispatch: (action) =>
    set((s) => {
      logChatDebug(
        "debug",
        `projection action: ${action.type}`,
        action,
        { channel: "projection" },
      );
      return {
        ...runProjectionReducer(sliceProjection(s), action),
        dispatch: s.dispatch,
        reset: s.reset,
      };
    }),
  reset: () =>
    set((s) => ({
      ...emptyRunProjectionState(),
      dispatch: s.dispatch,
      reset: s.reset,
    })),
}));
