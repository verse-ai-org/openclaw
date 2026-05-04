export type RunTerminalKind = "final" | "error" | "aborted";

export type SessionRunStatus = {
  /** Gateway run id when known (may be missing). */
  runId?: string | null;
  /** Last time we updated this session's status. */
  updatedAtMs: number;
};

export type RunStatusState = {
  /** Sessions currently believed to have an active/in-flight generation. */
  activeRunsBySession: Record<string, SessionRunStatus>;
};

export type RunStatusAction =
  | { type: "RUN_PROGRESS_SEEN"; sessionKey: string; runId?: string | null; nowMs?: number }
  | { type: "RUN_TERMINAL"; sessionKey: string; runId?: string | null; terminal: RunTerminalKind; nowMs?: number }
  | { type: "CLEAR_SESSION"; sessionKey: string }
  | { type: "RESET_ALL" };

