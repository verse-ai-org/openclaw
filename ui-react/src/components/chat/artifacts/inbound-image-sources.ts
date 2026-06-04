import type { ArtifactSummary, MessageAttachment } from "@/components/chat/types";
import {
  inboundImageBasename,
  inboundImageRemember,
  inboundImageSeen,
} from "./inbound-image-dedupe";

export type InboundImageSource = {
  key: string;
  fileName: string;
  mimeType: string;
  src: string;
};

export function buildInboundImageSources(params: {
  attachments?: MessageAttachment[];
  artifacts?: ArtifactSummary[];
}): InboundImageSource[] {
  const out: InboundImageSource[] = [];
  const seen = new Set<string>();

  // Attachments first so optimistic blob previews render before gateway mediaRef ack.
  for (const att of params.attachments ?? []) {
    if (!att.mimeType.startsWith("image/")) {
      continue;
    }
    const dedupeKey = att.mediaRef
      ? inboundImageBasename(att.mediaRef)
      : att.fileName.trim();
    if (!dedupeKey || inboundImageSeen(seen, dedupeKey)) {
      continue;
    }
    const mediaRef = att.mediaRef?.startsWith("media://") ? att.mediaRef : undefined;
    const previewSrc = att.previewUrl?.trim() || "";
    if (!previewSrc && !mediaRef) {
      continue;
    }
    inboundImageRemember(seen, dedupeKey);
    out.push({
      key: mediaRef ?? previewSrc ?? att.fileName,
      fileName: att.fileName.trim() || dedupeKey,
      mimeType: att.mimeType,
      src: previewSrc,
    });
  }

  for (const artifact of params.artifacts ?? []) {
    if (artifact.type !== "image" || !artifact.mediaRef?.startsWith("media://")) {
      continue;
    }
    const mediaRef = artifact.mediaRef;
    const dedupeKey = inboundImageBasename(mediaRef);
    if (inboundImageSeen(seen, dedupeKey)) {
      continue;
    }
    inboundImageRemember(seen, dedupeKey);
    out.push({
      key: mediaRef,
      fileName: artifact.title.trim() || dedupeKey,
      mimeType: artifact.mimeType?.trim() || "image/*",
      src: "",
    });
  }

  return out;
}
