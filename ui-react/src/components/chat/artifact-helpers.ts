import type { ArtifactRef, ArtifactSummary, MessageAttachment } from "@/components/chat/types";
import {
  inboundImageBasename,
  inboundImagesMatch,
} from "@/components/chat/artifacts/inbound-image-dedupe";

export function artifactRefsFromSummaries(summaries: ArtifactSummary[]): ArtifactRef[] {
  return summaries.map((summary) => ({
    artifactId: summary.id,
    ...(summary.role ? { role: summary.role } : {}),
  }));
}

export function resolveArtifactDisplayTitle(
  ref: ArtifactRef,
  summaries: ArtifactSummary[] | undefined,
  attachmentHint?: Pick<MessageAttachment, "fileName">,
): string {
  const match = summaries?.find((s) => s.id === ref.artifactId);
  const fromSummary = match?.title?.trim();
  if (fromSummary && !fromSummary.startsWith("artifact_")) {
    return fromSummary;
  }
  const fromAttachment = attachmentHint?.fileName?.trim();
  if (fromAttachment) {
    return fromAttachment;
  }
  return fromSummary || ref.artifactId;
}

export function resolveArtifactDisplayMime(
  ref: ArtifactRef,
  summaries: ArtifactSummary[] | undefined,
  attachmentHint?: Pick<MessageAttachment, "mimeType">,
): string {
  const match = summaries?.find((s) => s.id === ref.artifactId);
  const fromSummary = match?.mimeType?.trim();
  if (fromSummary) {
    return fromSummary;
  }
  const fromAttachment = attachmentHint?.mimeType?.trim();
  if (fromAttachment) {
    return fromAttachment;
  }
  return "application/octet-stream";
}

export function mergeInboundArtifactMediaIntoAttachments(
  attachments: MessageAttachment[] | undefined,
  artifacts: ArtifactSummary[],
): MessageAttachment[] | undefined {
  if (!attachments || attachments.length === 0) {
    return attachments;
  }
  const imageArtifacts = artifacts.filter(
    (a) => a.type === "image" && a.mediaRef?.startsWith("media://"),
  );
  if (imageArtifacts.length === 0) {
    return attachments;
  }
  let changed = false;
  const next = attachments.map((att) => {
    if (!att.mimeType.startsWith("image/")) {
      return att;
    }
    const match = imageArtifacts.find((artifact) =>
      inboundImagesMatch(
        att.mediaRef ? inboundImageBasename(att.mediaRef) : att.fileName,
        inboundImageBasename(artifact.mediaRef!),
      ),
    );
    if (!match?.mediaRef) {
      return att;
    }
    changed = true;
    return {
      ...att,
      mediaRef: match.mediaRef,
      fileName: att.fileName.trim() || match.title.trim() || inboundImageBasename(match.mediaRef),
    };
  });
  return changed ? next : attachments;
}

export function attachmentHintForArtifactRef(
  ref: ArtifactRef,
  artifactRefs: ArtifactRef[],
  attachments: MessageAttachment[] | undefined,
): MessageAttachment | undefined {
  if (!attachments || attachments.length === 0) {
    return undefined;
  }
  const refIndex = artifactRefs.findIndex((entry) => entry.artifactId === ref.artifactId);
  if (refIndex >= 0 && refIndex < attachments.length) {
    return attachments[refIndex];
  }
  return undefined;
}
