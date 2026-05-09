// ---------------------------------------------------------------------------
// UI domain message + rendering model types (normalized)
// ---------------------------------------------------------------------------

export type ChatMessageRole = "user" | "assistant";

export type ToolStreamPhase = "start" | "running" | "result" | "error";

/**
 * Tool UI surface keys rendered inside the chat message body.
 *
 * This is intentionally open-ended: new tool-ui components can be added without
 * needing to update a central union immediately.
 */
export type ToolUiComponent =
  | "question_flow"
  | "option_list"
  | "approval_card"
  | "chart"
  | "stats_display"
  | "link_preview"
  | "terminal"
  | "code_block"
  | "item_carousel"
  | "geo_map"
  | (string & {});

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
      /**
       * Chat-embedded UI surface (tool UI).
       *
       * Product semantics: this is user-facing content (NOT logs), so it should
       * render in the message body and should not be hidden inside the tool-call
       * (log) group.
       */
      type: "ui";
      /**
       * Stable identifier for the UI surface instance.
       *
       * Prefer using the Tool UI payload `id` (see `components/tool-ui/shared/schema.ts`)
       * over auto-generated runtime ids.
       */
      uiId: string;
      component: ToolUiComponent;
      payload: unknown;
    }
export type UiToolContentBlock = Extract<ContentBlock, { type: "ui" }>;

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

