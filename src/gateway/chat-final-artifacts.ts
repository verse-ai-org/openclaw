import { projectArtifactRefsForHistoryMessage } from "./chat-history-artifacts.js";
import type { ArtifactSummary } from "./protocol/index.js";
import { collectArtifactsFromMessage } from "./server-methods/artifacts.js";

type ArtifactRecord = ArtifactSummary & { data?: string; url?: string };

function resolveMessageSeq(message: Record<string, unknown>, fallback: number): number {
  const meta = message["__openclaw"];
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const seq = (meta as { seq?: unknown }).seq;
    if (typeof seq === "number" && Number.isInteger(seq) && seq > 0) {
      return seq;
    }
  }
  return fallback;
}

export function summarizeArtifactsForWire(records: ArtifactRecord[]): ArtifactSummary[] {
  return records.map(({ data: _data, url: _url, ...summary }) => summary);
}

/** Attach `artifactRefs` to the final chat message and optional wire-safe summaries. */
export function enrichChatFinalBroadcastPayload(params: {
  sessionKey: string;
  runId: string;
  message?: Record<string, unknown>;
  messageSeqFallback?: number;
}): {
  message?: Record<string, unknown>;
  artifacts?: ArtifactSummary[];
} {
  if (!params.message) {
    return {};
  }
  const message = params.message;
  const messageSeq = resolveMessageSeq(message, params.messageSeqFallback ?? 1);
  const projection = projectArtifactRefsForHistoryMessage({
    message,
    sessionKey: params.sessionKey,
    messageSeq,
  });

  const records: ArtifactRecord[] = [];
  // Final assistant rows may omit body runId; session-scoped indexing is enough here.
  collectArtifactsFromMessage({
    message,
    messageFallbackSeq: messageSeq,
    artifacts: records,
    sessionKey: params.sessionKey,
  });

  const artifacts = summarizeArtifactsForWire(records);
  let enriched: Record<string, unknown> = message;
  if (projection.artifactRefs.length > 0) {
    enriched = { ...enriched, artifactRefs: projection.artifactRefs };
  }
  if (projection.attachmentHints.length > 0) {
    enriched = { ...enriched, attachments: projection.attachmentHints };
  }

  return {
    message: enriched,
    ...(artifacts.length > 0 ? { artifacts } : {}),
  };
}
