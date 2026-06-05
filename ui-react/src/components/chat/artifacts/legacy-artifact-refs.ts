import type { ArtifactRef, MessageAttachment } from "@/components/chat/types";

export const LEGACY_ARTIFACT_ID_PREFIX = "legacy:";

export function isLegacySyntheticArtifactId(artifactId: string): boolean {
  return artifactId.trim().startsWith(LEGACY_ARTIFACT_ID_PREFIX);
}

export function legacyArtifactIdForAttachment(att: MessageAttachment): string {
  return `${LEGACY_ARTIFACT_ID_PREFIX}${att.fileName.trim()}`;
}

/** History appendix fallback: bind stripped attachment hints to synthetic refs. */
export function syntheticArtifactRefsFromLegacyAttachments(
  attachments: MessageAttachment[],
  role: "input" | "output" = "input",
): ArtifactRef[] {
  const out: ArtifactRef[] = [];
  const seen = new Set<string>();
  for (const att of attachments) {
    const fileName = att.fileName.trim();
    if (!fileName || seen.has(fileName)) {
      continue;
    }
    seen.add(fileName);
    out.push({
      artifactId: legacyArtifactIdForAttachment(att),
      role,
    });
  }
  return out;
}

let legacyStripWarned = false;

export function warnLegacyAttachmentStripOnce(): void {
  if (legacyStripWarned) {
    return;
  }
  legacyStripWarned = true;
  console.warn(
    "[artifacts] legacy appendix strip used for history display; prefer gateway artifactRefs",
  );
}
