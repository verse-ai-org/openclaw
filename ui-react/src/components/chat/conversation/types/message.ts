import type { ChatRole, MessageId, RunId } from "./ids";
import type { ChatPart } from "./parts";

export type CanonicalMessageStatus = "running" | "complete";

export type CanonicalMessage = {
  id: MessageId;
  role: ChatRole;
  createdAt: number;
  runId?: RunId;
  status: CanonicalMessageStatus;
  parts: ChatPart[];
  artifactRefs?: import("@/components/chat/types").ArtifactRef[];
  artifacts?: import("@/components/chat/types").ArtifactSummary[];
  /** @deprecated Prefer `artifactRefs`. */
  attachments?: import("@/components/chat/types").MessageAttachment[];
  metadata?: import("@/components/chat/types").ChatMessageMetadata;
};

