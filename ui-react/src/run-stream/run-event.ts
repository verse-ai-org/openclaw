import type { InteractiveContentBlock } from "@/components/chat/types";

/**
 * Protocol-agnostic normalized run events.
 * The Gateway adapter (gateway-run-adapter.ts) translates raw WS payloads into
 * these events; nothing below this layer knows about Gateway wire formats.
 */
export type RunEvent =
  /** A new run has started for the given session. */
  | { type: "run.started"; sessionKey: string; runId?: string }
  /** Cumulative full assistant text (not a delta — always the entire accumulated string). */
  | { type: "text.delta"; text: string }
  /** A tool call has started streaming. Triggers an auto-commit of current live text. */
  | { type: "tool.start"; id: string; name: string; args?: unknown }
  /** Partial streaming update for an in-progress tool call. */
  | { type: "tool.update"; id: string; partialOutput?: unknown }
  /** Tool call completed successfully. */
  | { type: "tool.result"; id: string; output?: unknown }
  /** Tool call failed. */
  | { type: "tool.error"; id: string; error?: string }
  /**
   * Interactive UI payload from `tool.start.args` (question_flow / option_list / approval_card).
   * Auto-commits preceding live text before inserting the card (same as tool.start).
   */
  | { type: "interactive.start"; block: InteractiveContentBlock }
  /** Run finished. `text` is the final assistant message text when provided by the gateway. */
  | { type: "run.finished"; text?: string }
  /** Run ended with an error. */
  | { type: "run.error"; message?: string }
  /** Run was aborted by user or gateway. */
  | { type: "run.aborted" };
