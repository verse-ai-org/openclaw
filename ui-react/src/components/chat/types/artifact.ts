/**
 * Hand-maintained mirror of `src/gateway/protocol/schema/artifacts.ts`.
 * Contract checked in `artifact-wire-contract.test.ts` (run `pnpm protocol:gen` first).
 */
export type ArtifactRef = {
  artifactId: string;
  role?: "input" | "output";
};

export type ArtifactDownloadMode = "bytes" | "url" | "unsupported";

/** Aligned with `src/gateway/protocol/schema/artifacts.ts` (ArtifactSummarySchema). */
export type ArtifactSummary = {
  id: string;
  type: string;
  title: string;
  mimeType?: string;
  sizeBytes?: number;
  sessionKey?: string;
  runId?: string;
  taskId?: string;
  messageSeq?: number;
  contentIndex?: number;
  source?: "user-upload" | "assistant-output" | "tool-output" | "offload";
  role?: "input" | "output";
  ingestChannel?: "inline-base64" | "path-ref" | "managed-image" | "transcript-block";
  /** Gateway inbound media ref for assistant-media preview. */
  mediaRef?: string;
  download: { mode: ArtifactDownloadMode };
};
