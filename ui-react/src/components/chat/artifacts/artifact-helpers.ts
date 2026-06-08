import type { ArtifactRef, ArtifactSummary, MessageAttachment } from "@/components/chat/types";
import { mergeArtifactMediaIntoAttachments } from "@/components/chat/artifacts/merge-attachment-media";

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

export function resolveArtifactChipTitleTooltip(params: {
  title: string;
  summary?: Pick<ArtifactSummary, "ingestChannel" | "localRevealPath" | "stagingRevealPath">;
}): string | undefined {
  if (params.summary?.ingestChannel !== "path-ref") {
    return undefined;
  }
  if (!params.summary.localRevealPath?.trim()) {
    return `${params.title} — cannot locate original file`;
  }
  if (params.summary.stagingRevealPath?.trim()) {
    return `${params.title} — agent edits a workspace copy; use the menu to replace the original or discard the copy`;
  }
  return `${params.title} — the agent may modify this file in place at the original path`;
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
  return mergeArtifactMediaIntoAttachments(attachments, artifacts);
}

export function attachmentHintForArtifactRef(
  ref: ArtifactRef,
  artifactRefs: ArtifactRef[],
  attachments: MessageAttachment[] | undefined,
  summaries?: ArtifactSummary[],
): MessageAttachment | undefined {
  if (!attachments || attachments.length === 0) {
    return undefined;
  }
  const refIndex = artifactRefs.findIndex((entry) => entry.artifactId === ref.artifactId);
  if (refIndex >= 0 && refIndex < attachments.length) {
    return attachments[refIndex];
  }
  const summary = summaries?.find((entry) => entry.id === ref.artifactId);
  const title = summary?.title?.trim();
  if (title) {
    const byTitle = attachments.find((att) => att.fileName.trim() === title);
    if (byTitle) {
      return byTitle;
    }
  }
  return undefined;
}
