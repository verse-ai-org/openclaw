import type { FC } from "react";
import { cn } from "@/lib/utils";
import type { ArtifactRef, ArtifactSummary } from "@/components/chat/types";
import { ArtifactRefChip, LegacyAttachmentChip } from "@/components/chat/ArtifactChip";
import type { MessageAttachment } from "@/components/chat/types";
import { attachmentHintForArtifactRef } from "@/components/chat/artifact-helpers";
import { hasInlineImageForRef } from "./resolve-message-artifacts";
import { InlineInboundImages } from "./InlineInboundImages";

const EMPTY_ARTIFACT_REFS: ArtifactRef[] = [];
const EMPTY_ATTACHMENTS: MessageAttachment[] = [];

export const MessageArtifactRefs: FC<{
  messageId: string;
  sessionKey: string;
  artifactRefs?: ArtifactRef[];
  artifacts?: ArtifactSummary[];
  legacyAttachments?: MessageAttachment[];
  /** User bubbles align chips to the end; assistant to the start. */
  align?: "start" | "end";
  /** When set, only refs with this role (or no role) are shown. */
  roleFilter?: "input" | "output";
}> = ({
  messageId,
  sessionKey,
  artifactRefs = EMPTY_ARTIFACT_REFS,
  artifacts,
  legacyAttachments = EMPTY_ATTACHMENTS,
  align = "end",
  roleFilter,
}) => {
  const refs = roleFilter
    ? artifactRefs.filter((ref) => ref.role !== (roleFilter === "input" ? "output" : "input"))
    : artifactRefs;

  const chipRefs = refs.filter(
    (ref) => !hasInlineImageForRef({ artifactRef: ref, summaries: artifacts, attachments: legacyAttachments }),
  );

  const showArtifactRefs = chipRefs.length > 0;
  const legacyNonInlineAttachments = legacyAttachments.filter(
    (att) => !(att.mimeType.startsWith("image/") && (att.mediaRef || att.previewUrl)),
  );
  const showLegacy = !showArtifactRefs && legacyNonInlineAttachments.length > 0;

  const hasInlineImages =
    legacyAttachments.some(
      (att) => att.mimeType.startsWith("image/") && (att.mediaRef || att.previewUrl),
    ) ||
    (artifacts?.some((a) => a.type === "image" && a.mediaRef?.startsWith("media://")) ?? false);

  if (!showArtifactRefs && !showLegacy && !hasInlineImages) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5",
        align === "end" ? "items-end" : "items-start",
        align === "start" ? "mb-2" : "",
      )}
    >
      <InlineInboundImages
        attachments={legacyAttachments}
        artifacts={artifacts}
        className={align === "end" ? "justify-end" : "justify-start"}
      />
      <div
        className={cn(
          "flex flex-wrap gap-1.5",
          align === "end" ? "justify-end" : "justify-start",
        )}
      >
      {showArtifactRefs
        ? chipRefs.map((ref) => (
            <ArtifactRefChip
              key={`${messageId}:${ref.artifactId}`}
              sessionKey={sessionKey}
              artifactRef={ref}
              artifacts={artifacts}
              attachmentHint={attachmentHintForArtifactRef(ref, artifactRefs, legacyAttachments)}
            />
          ))
        : legacyNonInlineAttachments.map((att) => (
            <LegacyAttachmentChip key={att.fileName} attachment={att} />
          ))}
      </div>
    </div>
  );
};
