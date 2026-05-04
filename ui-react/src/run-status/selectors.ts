import type { RunStatusState } from "./types";

export function isSessionRunning(state: RunStatusState, sessionKey: string | null | undefined): boolean {
  const k = typeof sessionKey === "string" ? sessionKey.trim() : "";
  if (!k) {
    return false;
  }
  return k in state.activeRunsBySession;
}

