import { create } from "zustand";
import { logChatDebug } from "@/lib/chat-debug";
import { emptyRunStatusState, runStatusReducer } from "./reducer";
import type { RunStatusAction, RunStatusState } from "./types";

type RunStatusStore = RunStatusState & {
  dispatch: (action: RunStatusAction) => void;
  reset: () => void;
};

export const useRunStatusStore = create<RunStatusStore>((set) => ({
  ...emptyRunStatusState(),
  dispatch: (action) =>
    set((s) => {
      logChatDebug("debug", `run-status action: ${action.type}`, action, {
        channel: "run.status",
      });
      return {
        ...runStatusReducer({ activeRunsBySession: s.activeRunsBySession }, action),
        dispatch: s.dispatch,
        reset: s.reset,
      };
    }),
  reset: () =>
    set((s) => ({
      ...emptyRunStatusState(),
      dispatch: s.dispatch,
      reset: s.reset,
    })),
}));

