import type { ArtifactSummary, MessageAttachment } from "@/components/chat/types";
import { inboundImageBasename, inboundImagesMatch } from "./inbound-image-dedupe";

function artifactMediaRefKey(artifact: ArtifactSummary): string {
  return inboundImageBasename(artifact.mediaRef ?? artifact.title);
}

function attachmentMediaMatchKey(att: MessageAttachment): string {
  if (att.mediaRef?.startsWith("media://")) {
    return inboundImageBasename(att.mediaRef);
  }
  return att.fileName.trim();
}

function attachmentMatchesArtifact(att: MessageAttachment, artifact: ArtifactSummary): boolean {
  const attKey = attachmentMediaMatchKey(att);
  if (!attKey) {
    return false;
  }
  const title = artifact.title.trim();
  if (title && (attKey === title || inboundImagesMatch(attKey, title))) {
    return true;
  }
  if (!artifact.mediaRef?.startsWith("media://")) {
    return false;
  }
  return inboundImagesMatch(attKey, artifactMediaRefKey(artifact));
}

/** Bind gateway `mediaRef` values onto message attachment hints (images + filename matches). */
export function mergeArtifactMediaIntoAttachments(
  attachments: MessageAttachment[] | undefined,
  artifacts: ArtifactSummary[] | undefined,
): MessageAttachment[] | undefined {
  if (!attachments?.length) {
    return attachments;
  }
  const withMediaRef = (artifacts ?? []).filter((artifact) =>
    artifact.mediaRef?.startsWith("media://"),
  );
  if (withMediaRef.length === 0) {
    return attachments;
  }

  let changed = false;
  const next = attachments.map((att) => {
    if (att.mediaRef?.startsWith("media://")) {
      return att;
    }
    const match = withMediaRef.find((artifact) => attachmentMatchesArtifact(att, artifact));
    if (!match?.mediaRef) {
      return att;
    }
    changed = true;
    return {
      ...att,
      mediaRef: match.mediaRef,
      fileName:
        att.fileName.trim() ||
        match.title.trim() ||
        inboundImageBasename(match.mediaRef),
    };
  });
  return changed ? next : attachments;
}
