import type { ArtifactRef, ArtifactSummary, ChatMessage, MessageAttachment } from "@/components/chat/types";
import { useArtifactCacheStore } from "@/store/artifact-cache.store";

function basenameFromRef(value: string): string {
  const trimmed = value.trim();
  const slash = trimmed.lastIndexOf("/");
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

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

function attachmentsWithMediaRefs(
  attachments: MessageAttachment[] | undefined,
  summaries: ArtifactSummary[] | undefined,
): MessageAttachment[] | undefined {
  if (!attachments || attachments.length === 0) {
    return attachments;
  }
  let changed = false;
  const next = attachments.map((att) => {
    if (att.mediaRef?.startsWith("media://")) {
      return att;
    }
    const match = summaries?.find(
      (s) =>
        s.mediaRef?.startsWith("media://") &&
        basenameFromRef(s.mediaRef) === att.fileName.trim(),
    );
    if (!match?.mediaRef) {
      return att;
    }
    changed = true;
    return { ...att, mediaRef: match.mediaRef };
  });
  return changed ? next : attachments;
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
  const attachments = attachmentsWithMediaRefs(message.attachments, artifacts);
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

export function isImageArtifactSummary(summary: ArtifactSummary | undefined): boolean {
  return summary?.type === "image" || Boolean(summary?.mimeType?.startsWith("image/"));
}

export function hasInlineImageForRef(params: {
  artifactRef: ArtifactRef;
  summaries: ArtifactSummary[] | undefined;
  attachments: MessageAttachment[] | undefined;
}): boolean {
  const summary =
    params.summaries?.find((s) => s.id === params.artifactRef.artifactId) ?? undefined;
  if (isImageArtifactSummary(summary) && summary?.mediaRef?.startsWith("media://")) {
    return true;
  }
  const title = summary?.title?.trim() || "";
  return (
    params.attachments?.some((att) => {
      if (!att.mimeType.startsWith("image/") || !(att.previewUrl || att.mediaRef)) {
        return false;
      }
      if (!title || title.startsWith("artifact_")) {
        return true;
      }
      const fileName = att.fileName.trim();
      return (
        fileName === title ||
        basenameFromRef(att.mediaRef ?? "") === title ||
        basenameFromRef(att.mediaRef ?? "") === basenameFromRef(title)
      );
    }) ?? false
  );
}
