/** Raw gateway message shape before normalization (e.g. chat.history). */
export type RawMessage = {
  id?: string;
  role?: string;
  content?: unknown;
  text?: string;
  /** Gateway may attach file display hints when user content is shortened for history. */
  attachments?: unknown;
  ts?: number;
  timestamp?: number;
  runId?: string;
  sessionKey?: string;
};
