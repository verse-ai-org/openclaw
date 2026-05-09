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
  /** Optional display-only metadata preserved from UI messages (e.g. attachments). */
  attachments?: import("@/components/chat/types").MessageAttachment[];
  metadata?: import("@/components/chat/types").ChatMessageMetadata;
};

