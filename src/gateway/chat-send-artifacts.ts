import path from "node:path";
import type { ChatAttachmentRef } from "./server-methods/attachment-normalize.js";
import type { OffloadedRef } from "./chat-attachments.js";
import { buildArtifactId } from "./chat-artifact-id.js";
import type { ArtifactSummary } from "./protocol/index.js";

type SendAttachmentInput = {
  mimeType: string;
  fileName: string;
  content: string;
};

/** Transcript content for user messages with path-based file refs (no paths in text). */
export function buildUserTranscriptContentWithAttachmentRefs(
  message: string,
  refs: ChatAttachmentRef[],
): string | Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  const trimmed = message.trim();
  if (trimmed) {
    blocks.push({ type: "text", text: trimmed });
  }
  for (const ref of refs) {
    const title = ref.fileName?.trim() || "file";
    const mimeType = ref.mimeType?.trim() || "application/octet-stream";
    blocks.push({
      type: "file",
      title,
      fileName: title,
      mimeType,
      ...(ref.size > 0 ? { sizeBytes: ref.size } : {}),
    });
  }
  if (blocks.length === 0) {
    return "";
  }
  if (blocks.length === 1 && blocks[0]?.type === "text") {
    return trimmed;
  }
  return blocks;
}

export function attachmentRefArtifactContentIndexOffset(message: string): number {
  return message.trim().length > 0 ? 1 : 0;
}

export function buildChatSendAckArtifacts(params: {
  sessionKey: string;
  runId: string;
  attachments: SendAttachmentInput[];
  offloadedRefs: OffloadedRef[];
  attachmentRefs: ChatAttachmentRef[];
  /** content[] index of the first attachmentRef file block in the user transcript row. */
  attachmentRefContentIndexOffset?: number;
  /** Provisional seq for id stability until transcript append; use 1 for send-scoped ids. */
  messageSeq?: number;
}): ArtifactSummary[] {
  const messageSeq = params.messageSeq ?? 1;
  const artifacts: ArtifactSummary[] = [];
  let contentIndex = 0;

  for (const att of params.attachments) {
    const mimeType = att.mimeType?.trim() || "application/octet-stream";
    const type = mimeType.startsWith("image/")
      ? "image"
      : mimeType.startsWith("audio/")
        ? "audio"
        : "file";
    const title = att.fileName?.trim() || `${type}-${contentIndex + 1}`;
    const hasInlineBase64 = att.content.trim().length > 0;
    artifacts.push({
      id: buildArtifactId({
        sessionKey: params.sessionKey,
        messageSeq,
        contentIndex,
        title,
        type,
      }),
      type,
      title,
      mimeType,
      sessionKey: params.sessionKey,
      runId: params.runId,
      messageSeq,
      contentIndex,
      source: "user-upload",
      role: "input",
      ingestChannel: "inline-base64",
      download: { mode: hasInlineBase64 ? "bytes" : "unsupported" },
    });
    contentIndex += 1;
  }

  for (const ref of params.offloadedRefs) {
    const mimeType = ref.mimeType?.trim() || "application/octet-stream";
    const type = mimeType.startsWith("image/")
      ? "image"
      : mimeType.startsWith("audio/")
        ? "audio"
        : "file";
    const title = ref.label?.trim() || path.basename(ref.path) || `${type}-${contentIndex + 1}`;
    const mediaRef = ref.mediaRef?.trim();
    const hasInboundRef = Boolean(mediaRef?.startsWith("media://"));
    artifacts.push({
      id: buildArtifactId({
        sessionKey: params.sessionKey,
        messageSeq,
        contentIndex,
        title,
        type,
      }),
      type,
      title,
      mimeType,
      sizeBytes: ref.sizeBytes,
      sessionKey: params.sessionKey,
      runId: params.runId,
      messageSeq,
      contentIndex,
      source: "offload",
      role: "input",
      ingestChannel: hasInboundRef ? "path-ref" : "inline-base64",
      ...(hasInboundRef ? { mediaRef } : {}),
      download: { mode: hasInboundRef && type === "image" ? "bytes" : "unsupported" },
    });
    contentIndex += 1;
  }

  const refIndexOffset = params.attachmentRefContentIndexOffset ?? contentIndex;
  for (const [refIdx, ref] of params.attachmentRefs.entries()) {
    const mimeType = ref.mimeType?.trim() || "application/octet-stream";
    const type = mimeType.startsWith("image/")
      ? "image"
      : mimeType.startsWith("audio/")
        ? "audio"
        : "file";
    const title = ref.fileName?.trim() || path.basename(ref.path) || `${type}-${refIdx + 1}`;
    const blockIndex = refIndexOffset + refIdx;
    artifacts.push({
      id: buildArtifactId({
        sessionKey: params.sessionKey,
        messageSeq,
        contentIndex: blockIndex,
        title,
        type,
      }),
      type,
      title,
      mimeType,
      sizeBytes: ref.size > 0 ? ref.size : undefined,
      sessionKey: params.sessionKey,
      runId: params.runId,
      messageSeq,
      contentIndex: blockIndex,
      source: "user-upload",
      role: "input",
      ingestChannel: "path-ref",
      download: { mode: "unsupported" },
    });
  }

  return artifacts;
}
