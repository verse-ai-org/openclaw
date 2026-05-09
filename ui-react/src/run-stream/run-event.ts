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
  /**
   * Append-only text delta from `agent.stream=assistant` (true incremental diff).
   * `fullText` is optional and can be used for debugging/realignment.
   */
  | { type: "text.append"; text: string; fullText?: string }
  /** A tool call has started streaming. Triggers an auto-commit of current live text. */
  | { type: "tool.start"; id: string; name: string; args?: unknown }
  /** Tool call has a UI presentation (interactive card). */
  | { type: "tool.ui"; id: string; name: string; kind: string; payload: unknown }
  /** Partial streaming update for an in-progress tool call. */
  | { type: "tool.update"; id: string; partialOutput?: unknown }
  /** Tool call completed successfully. */
  | { type: "tool.result"; id: string; output?: unknown }
  /** Tool call failed. */
  | { type: "tool.error"; id: string; error?: string }
  /** Run finished. `text` is the final assistant message text when provided by the gateway. */
  | { type: "run.finished"; text?: string }
  /** Run ended with an error. */
  | { type: "run.error"; message?: string }
  /** Run was aborted by user or gateway. */
  | { type: "run.aborted" };
