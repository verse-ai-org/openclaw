import { type FC, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { ArtifactRef, ArtifactSummary } from "@/components/chat/types";
import { ArtifactRefChip } from "@/components/chat/ArtifactChip";
import type { MessageAttachment } from "@/components/chat/types";
import { attachmentHintForArtifactRef } from "@/components/chat/artifacts/artifact-helpers";
import { syntheticArtifactRefsFromLegacyAttachments } from "./legacy-artifact-refs";
import {
  hasInlineImageForRef,
  isLegacyInlineAttachment,
  messageHasInlineArtifactImages,
} from "./artifact-renderer-registry";
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

  const displayRefs = useMemo(() => {
    if (refs.length > 0) {
      return refs;
    }
    const nonInline = legacyAttachments.filter((att) => !isLegacyInlineAttachment(att));
    return syntheticArtifactRefsFromLegacyAttachments(
      nonInline,
      roleFilter === "output" ? "output" : "input",
    );
  }, [legacyAttachments, refs, roleFilter]);

  const chipRefs = displayRefs.filter(
    (ref) => !hasInlineImageForRef({ artifactRef: ref, summaries: artifacts, attachments: legacyAttachments }),
  );

  const hasInlineImages = messageHasInlineArtifactImages({
    attachments: legacyAttachments,
    artifacts,
  });

  if (chipRefs.length === 0 && !hasInlineImages) {
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
      {chipRefs.map((ref) => (
        <ArtifactRefChip
          key={`${messageId}:${ref.artifactId}`}
          sessionKey={sessionKey}
          artifactRef={ref}
          artifacts={artifacts}
          attachmentHint={attachmentHintForArtifactRef(
            ref,
            displayRefs,
            legacyAttachments,
            artifacts,
          )}
        />
      ))}
      </div>
    </div>
  );
};
