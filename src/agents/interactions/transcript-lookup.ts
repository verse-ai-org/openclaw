/**
 * Transcript-based fallback lookup for interaction state.
 *
 * When the gateway restarts, `pendingByInteractionId` (in-memory) is cleared.
 * The UI / channel may still show the interaction form (reconstructed from the
 * `interaction_request` transcript row). This helper lets callers detect that
 * case and recover gracefully.
 */

import { loadSessionEntry, readSessionMessages } from "../../gateway/session-utils.js";

export type InteractionTranscriptEntry = {
  component: string;
  runId?: string;
};

export type TranscriptLookupResult =
  | ({ found: true; alreadyResolved: false } & InteractionTranscriptEntry)
  | { found: true; alreadyResolved: true }
  | { found: false };

/**
 * Scan the session transcript for an `interaction_request` row matching
 * `interactionId`.
 *
 * Returns:
 * - `{ found: true, alreadyResolved: false, component, runId }` — open request,
 *   no response yet.
 * - `{ found: true, alreadyResolved: true }` — a response row already exists
 *   (idempotent / restart-safe reply path).
 * - `{ found: false }` — the interaction id is not in the transcript at all.
 */
export function lookupInteractionFromTranscript(
  interactionId: string,
  sessionKey: string,
): TranscriptLookupResult {
  try {
    const { storePath, entry } = loadSessionEntry(sessionKey);
    const sessionId = entry?.sessionId;
    // readSessionMessages tolerates undefined storePath; sessionId is required.
    if (!sessionId) return { found: false };

    const messages = readSessionMessages(sessionId, storePath, entry?.sessionFile);
    let requestEntry: InteractionTranscriptEntry | undefined;

    for (const msg of messages) {
      const m = msg as Record<string, unknown>;
      const role = m.role;
      if (typeof role !== "string" || m.interactionId !== interactionId) continue;

      if (role === "interaction_response") {
        return { found: true, alreadyResolved: true };
      }
      if (role === "interaction_request") {
        requestEntry = {
          component: typeof m.component === "string" ? m.component : interactionId,
          runId: typeof m.runId === "string" ? m.runId : undefined,
        };
      }
    }

    if (requestEntry) {
      return { found: true, alreadyResolved: false, ...requestEntry };
    }
    return { found: false };
  } catch {
    return { found: false };
  }
}
