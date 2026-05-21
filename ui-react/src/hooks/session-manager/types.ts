export interface SessionsListDefaults {
  contextTokens?: number | null;
}

export interface SessionEntry {
  key: string;
  /** User-set label (e.g. via /label command). */
  label?: string;
  /** Backend-derived display name (channel name, group name, etc.). */
  displayName?: string;
  /** Title inferred from the first user message in the transcript. */
  derivedTitle?: string;
  /** Last message snippet for preview. */
  lastMessagePreview?: string;
  updatedAt?: number;
  /** Session context snapshot (from gateway sessions.list). */
  totalTokens?: number;
  totalTokensFresh?: boolean;
  contextTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
}
