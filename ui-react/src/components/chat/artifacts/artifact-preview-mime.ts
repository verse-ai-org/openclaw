export const PREVIEW_MAX_BYTES = 20 * 1024 * 1024;

export type ArtifactPreviewKind = "image" | "pdf" | "text" | "audio" | "none";

export function resolveArtifactPreviewKind(mimeType: string): ArtifactPreviewKind {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized.startsWith("image/")) {
    return "image";
  }
  if (normalized === "application/pdf") {
    return "pdf";
  }
  if (normalized.startsWith("audio/")) {
    return "audio";
  }
  if (
    normalized.startsWith("text/") ||
    normalized === "application/json" ||
    normalized === "application/xml" ||
    normalized === "application/markdown"
  ) {
    return "text";
  }
  return "none";
}

export function isPreviewableMime(mimeType: string): boolean {
  return resolveArtifactPreviewKind(mimeType) !== "none";
}

export function exceedsPreviewMaxBytes(sizeBytes?: number): boolean {
  return typeof sizeBytes === "number" && sizeBytes > PREVIEW_MAX_BYTES;
}
