import type { ArtifactRef, ArtifactSummary, ChatMessage, MessageAttachment } from "@/components/chat/types";
import { mergeArtifactMediaIntoAttachments } from "./merge-attachment-media";
import {
  hasInlineImageForRef,
  isImageArtifactSummary,
} from "./artifact-renderer-registry";
import { useArtifactCacheStore } from "@/store/artifact-cache.store";

function summaryTypeFromMime(mimeType: string): ArtifactSummary["type"] {
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }
  return "file";
}

function synthesizeSummariesFromAttachments(
  artifactRefs: ArtifactRef[] | undefined,
  attachments: MessageAttachment[] | undefined,
  byId: Map<string, ArtifactSummary>,
): void {
  if (!artifactRefs || !attachments) {
    return;
  }
  for (let i = 0; i < artifactRefs.length; i += 1) {
    const ref = artifactRefs[i];
    const att = attachments[i];
    if (!ref || !att?.fileName.trim() || byId.has(ref.artifactId)) {
      continue;
    }
    const mimeType = att.mimeType.trim() || "application/octet-stream";
    byId.set(ref.artifactId, {
      id: ref.artifactId,
      type: summaryTypeFromMime(mimeType),
      title: att.fileName.trim(),
      mimeType,
      download: { mode: "unsupported" },
      ...(att.mediaRef?.startsWith("media://") ? { mediaRef: att.mediaRef } : {}),
    });
  }
}

function summariesForMessage(
  sessionKey: string,
  artifactRefs: ArtifactRef[] | undefined,
  inline: ArtifactSummary[] | undefined,
  attachments: MessageAttachment[] | undefined,
): ArtifactSummary[] | undefined {
  const byId = new Map<string, ArtifactSummary>();
  for (const summary of inline ?? []) {
    byId.set(summary.id, summary);
  }
  for (const ref of artifactRefs ?? []) {
    const cached = useArtifactCacheStore.getState().getSummary(sessionKey, ref.artifactId);
    if (cached) {
      byId.set(cached.id, cached);
    }
  }
  synthesizeSummariesFromAttachments(artifactRefs, attachments, byId);
  return byId.size > 0 ? [...byId.values()] : undefined;
}

export function enrichChatMessageWithArtifactCache(
  sessionKey: string,
  message: ChatMessage,
): ChatMessage {
  const artifacts = summariesForMessage(
    sessionKey,
    message.artifactRefs,
    message.artifacts,
    message.attachments,
  );
  const attachments = mergeArtifactMediaIntoAttachments(message.attachments, artifacts);
  if (artifacts === message.artifacts && attachments === message.attachments) {
    return message;
  }
  return {
    ...message,
    ...(artifacts ? { artifacts } : {}),
    ...(attachments ? { attachments } : {}),
  };
}

export function enrichChatMessagesWithArtifactCache(
  sessionKey: string,
  messages: ChatMessage[],
): ChatMessage[] {
  return messages.map((m) => enrichChatMessageWithArtifactCache(sessionKey, m));
}

export { hasInlineImageForRef, isImageArtifactSummary };
