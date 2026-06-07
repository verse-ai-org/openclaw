import type {
  ArtifactDownloadMode,
  ArtifactRef,
  ArtifactSummary,
  MessageAttachment,
} from "@/components/chat/types";
import { getElectronBridge } from "@/utils/electron-env";
import { exceedsPreviewMaxBytes, isPreviewableMime } from "./artifact-preview-mime";
import { inboundImageBasename } from "./inbound-image-dedupe";

export type ArtifactRenderType = "image" | "audio" | "file";

export type ArtifactChipInteraction =
  | "preview-image"
  | "preview-file"
  | "reveal-in-folder"
  | "reveal-staging-in-folder"
  | "open-url"
  | "download-file"
  | "none";

export type ResolveArtifactInteractionParams = {
  summary?: ArtifactSummary;
  renderType: ArtifactRenderType;
  mimeType: string;
  downloadMode?: ArtifactDownloadMode;
  source?: ArtifactSummary["source"];
  ingestChannel?: ArtifactSummary["ingestChannel"];
  role?: ArtifactRef["role"];
  isElectron?: boolean;
};

function basenameFromRef(value: string): string {
  return inboundImageBasename(value);
}

export function isElectronEnvironment(): boolean {
  return getElectronBridge()?.isElectron === true;
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

export function resolveArtifactPrimaryInteraction(
  params: ResolveArtifactInteractionParams,
): ArtifactChipInteraction {
  const {
    summary,
    renderType,
    mimeType,
    downloadMode,
    ingestChannel,
    isElectron = isElectronEnvironment(),
  } = params;

  if (downloadMode === "url") {
    return "open-url";
  }

  if (downloadMode !== "bytes") {
    if (ingestChannel === "path-ref" && isElectron && summary?.localRevealPath?.trim()) {
      return "reveal-in-folder";
    }
    return "none";
  }

  if (exceedsPreviewMaxBytes(summary?.sizeBytes)) {
    return "download-file";
  }

  if (renderType === "image" && mimeType.startsWith("image/")) {
    return "preview-image";
  }

  if (isPreviewableMime(mimeType)) {
    return "preview-file";
  }

  return "download-file";
}

export function resolveArtifactSecondaryInteraction(
  primary: ArtifactChipInteraction,
  params?: { summary?: ArtifactSummary; isElectron?: boolean },
): ArtifactChipInteraction {
  if (primary === "preview-image" || primary === "preview-file") {
    return "download-file";
  }
  if (
    primary === "reveal-in-folder" &&
    (params?.isElectron ?? isElectronEnvironment()) &&
    params?.summary?.stagingRevealPath?.trim()
  ) {
    return "reveal-staging-in-folder";
  }
  return "none";
}

/** @deprecated Use resolveArtifactPrimaryInteraction */
export function resolveArtifactChipInteraction(params: {
  renderType: ArtifactRenderType;
  mimeType: string;
  downloadMode?: ArtifactDownloadMode;
}): ArtifactChipInteraction {
  return resolveArtifactPrimaryInteraction(params);
}

export function isArtifactChipInteractive(interaction: ArtifactChipInteraction): boolean {
  return interaction !== "none";
}

export function isArtifactPreviewInteraction(
  interaction: ArtifactChipInteraction,
): interaction is "preview-image" | "preview-file" {
  return interaction === "preview-image" || interaction === "preview-file";
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
