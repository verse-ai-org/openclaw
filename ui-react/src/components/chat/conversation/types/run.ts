import type { MessageId, RunId, ThreadId } from "./ids";

export type CanonicalRunStatus = "running" | "finished" | "error" | "aborted";

export type CanonicalRun = {
  id: RunId;
  threadId: ThreadId;
  status: CanonicalRunStatus;
  startedAt: number;
  finishedAt?: number;
  errorMessage?: string;
  /** The assistant message id associated with this run, if any. */
  assistantMessageId?: MessageId;
};

