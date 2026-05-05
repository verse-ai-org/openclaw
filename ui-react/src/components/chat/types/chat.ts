import type { SerializableQuestionFlow } from "@/components/tool-ui/question-flow";
import type { SerializableOptionList } from "@/components/tool-ui/option-list";
import type { SerializableApprovalCard } from "@/components/tool-ui/approval-card/schema";

// ---------------------------------------------------------------------------
// UI domain message + rendering model types (normalized)
// ---------------------------------------------------------------------------

export type ChatMessageRole = "user" | "assistant";

export type ToolStreamPhase = "start" | "running" | "result" | "error";
export type InteractiveKind = "question_flow" | "option_list" | "approval_card";

export interface ToolStreamEntry {
  id: string;
  toolName?: string;
  phase: ToolStreamPhase;
  input?: unknown;
  output?: unknown;
  error?: string;
}

/**
 * A typed content block within an assistant message.
 * Preserves the original ordering of text and tool-call segments so that the
 * UI can render them interleaved (text → tool → text → tool …).
 */
export type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      argsText?: string;
      result?: string;
      phase: "call" | "result" | "error";
    }
  | {
      type: "interactive";
      interactiveId: string;
      kind: InteractiveKind;
      payload:
        | SerializableQuestionFlow
        | SerializableOptionList
        | SerializableApprovalCard;
    };

export type InteractiveContentBlock = Extract<ContentBlock, { type: "interactive" }>;

export interface InteractiveSummaryPair {
  question: string;
  answer: string;
}

/** A sent file attachment stored with the message for display. */
export interface MessageAttachment {
  /** Original file name */
  fileName: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
}

export interface InteractionMessageMetadata {
  id: string;
  component: string;
  schemaVersion: number;
  status: "submitted";
  payload: unknown;
  submittedAt: number;
}

export interface ChatMessageMetadata {
  interaction?: InteractionMessageMetadata;
}

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  ts: number;
  runId?: string;
  sessionKey?: string;
  /** File attachments sent with this user message (for display only) */
  attachments?: MessageAttachment[];
  /** Optional structured metadata attached to this message. */
  metadata?: ChatMessageMetadata;
  /**
   * Ordered content blocks (text + tool-call) preserving the original
   * interleaved structure from the Gateway.
   */
  contentBlocks?: ContentBlock[];
}

