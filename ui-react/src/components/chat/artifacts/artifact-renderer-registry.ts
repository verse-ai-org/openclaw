import type {
  ArtifactDownloadMode,
  ArtifactRef,
  ArtifactSummary,
  MessageAttachment,
} from "@/components/chat/types";
import { inboundImageBasename } from "./inbound-image-dedupe";

export type ArtifactRenderType = "image" | "audio" | "file";

export type ArtifactChipInteraction = "preview-image" | "download-file" | "open-url" | "none";

function basenameFromRef(value: string): string {
  return inboundImageBasename(value);
}

export function resolveArtifactRenderType(
  summary: ArtifactSummary | undefined,
  mimeType: string,
): ArtifactRenderType {
  if (summary?.type === "audio" || mimeType.startsWith("audio/")) {
    return "audio";
  }
  if (summary?.type === "image" || mimeType.startsWith("image/")) {
    return "image";
  }
  return "file";
}

export function isImageArtifactSummary(summary: ArtifactSummary | undefined): boolean {
  return resolveArtifactRenderType(summary, summary?.mimeType ?? "") === "image";
}

export function resolveArtifactChipInteraction(params: {
  renderType: ArtifactRenderType;
  mimeType: string;
  downloadMode?: ArtifactDownloadMode;
}): ArtifactChipInteraction {
  const { renderType, mimeType, downloadMode } = params;
  if (downloadMode === "url") {
    return "open-url";
  }
  if (downloadMode !== "bytes") {
    return "none";
  }
  if (renderType === "image" && mimeType.startsWith("image/")) {
    return "preview-image";
  }
  return "download-file";
}

export function isLegacyInlineAttachment(att: MessageAttachment): boolean {
  return att.mimeType.startsWith("image/") && Boolean(att.mediaRef || att.previewUrl);
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
      if (!isLegacyInlineAttachment(att)) {
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

export function messageHasInlineArtifactImages(params: {
  attachments?: MessageAttachment[];
  artifacts?: ArtifactSummary[];
}): boolean {
  if (params.attachments?.some((att) => isLegacyInlineAttachment(att))) {
    return true;
  }
  return (
    params.artifacts?.some(
      (artifact) => artifact.type === "image" && artifact.mediaRef?.startsWith("media://"),
    ) ?? false
  );
}
