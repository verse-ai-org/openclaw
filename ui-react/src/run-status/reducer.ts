import type { RunStatusAction, RunStatusState } from "./types";

export function emptyRunStatusState(): RunStatusState {
  return { activeRunsBySession: {} };
}

function normalizeKey(raw: string): string {
  return raw.trim();
}

export function runStatusReducer(state: RunStatusState, action: RunStatusAction): RunStatusState {
  switch (action.type) {
    case "RESET_ALL":
      return emptyRunStatusState();

    case "CLEAR_SESSION": {
      const k = normalizeKey(action.sessionKey);
      if (!k || !(k in state.activeRunsBySession)) {
        return state;
      }
      const { [k]: _removed, ...rest } = state.activeRunsBySession;
      return { ...state, activeRunsBySession: rest };
    }

    case "RUN_TERMINAL": {
      // Terminal implies no longer active for that session.
      const k = normalizeKey(action.sessionKey);
      if (!k) {
        return state;
      }
      if (!(k in state.activeRunsBySession)) {
        return state;
      }
      const { [k]: _removed, ...rest } = state.activeRunsBySession;
      return { ...state, activeRunsBySession: rest };
    }

    case "RUN_PROGRESS_SEEN": {
      const k = normalizeKey(action.sessionKey);
      if (!k) {
        return state;
      }
      const now = action.nowMs ?? Date.now();
      const prev = state.activeRunsBySession[k];
      const nextRunId =
        typeof action.runId === "string" && action.runId.trim()
          ? action.runId.trim()
          : prev?.runId ?? null;
      return {
        ...state,
        activeRunsBySession: {
          ...state.activeRunsBySession,
          [k]: { runId: nextRunId, updatedAtMs: now },
        },
      };
    }

    default:
      return state;
  }
}

