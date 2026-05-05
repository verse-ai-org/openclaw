import { sliceStreamAfterCommittedAssistant } from "@/components/chat/utils/committed-stream-prefix";
import type { RunProjectionAction, RunProjectionState } from "./types";

export function emptyRunProjectionState(): RunProjectionState {
  return {
    liveCumulativeText: null,
    committedBlocks: [],
    toolStreamById: new Map(),
    toolStreamOrder: [],
    interactiveStreamById: new Map(),
    interactiveStreamOrder: [],
    interactiveSummaryById: {},
  };
}

export function runProjectionReducer(
  state: RunProjectionState,
  action: RunProjectionAction,
): RunProjectionState {
  switch (action.type) {
    case "RESET":
      return emptyRunProjectionState();

    case "CHAT_DELTA":
      return { ...state, liveCumulativeText: action.text };

    case "COMMIT_CURRENT_TEXT": {
      const { liveCumulativeText: stream, committedBlocks } = state;
      if (!stream || !stream.trim()) {
        return { ...state, liveCumulativeText: "" };
      }
      const suffix = sliceStreamAfterCommittedAssistant(stream, committedBlocks);
      if (!suffix.trim()) {
        return { ...state, liveCumulativeText: "" };
      }
      return {
        ...state,
        committedBlocks: [...committedBlocks, { type: "text", text: suffix }],
        liveCumulativeText: "",
      };
    }

    case "UPSERT_TOOL_STREAM": {
      const next = new Map(state.toolStreamById);
      next.set(action.entry.id, action.entry);
      const order = state.toolStreamOrder.includes(action.entry.id)
        ? state.toolStreamOrder
        : [...state.toolStreamOrder, action.entry.id];
      return { ...state, toolStreamById: next, toolStreamOrder: order };
    }

    case "UPSERT_INTERACTIVE_STREAM": {
      const next = new Map(state.interactiveStreamById);
      next.set(action.entry.interactiveId, action.entry);
      const order = state.interactiveStreamOrder.includes(action.entry.interactiveId)
        ? state.interactiveStreamOrder
        : [...state.interactiveStreamOrder, action.entry.interactiveId];
      return {
        ...state,
        interactiveStreamById: next,
        interactiveStreamOrder: order,
      };
    }

    case "SET_INTERACTIVE_SUMMARY":
      return {
        ...state,
        interactiveSummaryById: {
          ...state.interactiveSummaryById,
          [action.interactiveId]: action.pairs,
        },
      };

    case "CLEAR_INTERACTIVE_SUMMARY": {
      if (!(action.interactiveId in state.interactiveSummaryById)) {
        return state;
      }
      const { [action.interactiveId]: _removed, ...rest } =
        state.interactiveSummaryById;
      return { ...state, interactiveSummaryById: rest };
    }

    default:
      return state;
  }
}
