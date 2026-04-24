import type { z } from "zod";

/**
 * Status of an interaction at the time of response.
 *
 * - `submitted`: User provided structured data.
 * - `cancelled`: User (or system) cancelled before submission.
 * - `timed_out`: No response within the requested window.
 */
export type InteractionStatus = "submitted" | "cancelled" | "timed_out";

/**
 * Event emitted by the agent runtime when the LLM asks for structured user input.
 */
export interface InteractionRequestEvent {
  stream: "interaction";
  data: {
    phase: "request";
    interactionId: string;
    component: string;
    payload: unknown;
    schemaVersion: number;
    cancellable?: boolean;
    timeoutMs?: number;
  };
}

/**
 * Event emitted once the user (or a downgrade handler) has satisfied an interaction.
 *
 * `data` is the component-specific response body; its shape is described by
 * `InteractionComponentManifest.responseSchema`.
 */
export interface InteractionResponseEvent {
  stream: "interaction";
  data: {
    phase: "response";
    interactionId: string;
    status: InteractionStatus;
    responseBy?: { userId?: string; channel?: string };
    data: unknown;
  };
}

/**
 * A single registered interaction component (e.g. `question_flow`, `option_list`).
 *
 * - `requestSchema` validates what the LLM must emit inside `<ask>` payload.
 * - `responseSchema` validates the body that the UI / channel downgrade sends
 *   back via `chat.interactionRespond`.
 * - `description` is the canonical text injected into the system prompt for
 *   this component (replaces the former tool-description mechanism).
 * - `exampleRequest` / `exampleResponse` help few-shot prompting.
 */
export interface InteractionComponentManifest<
  TRequest = unknown,
  TResponse = unknown,
> {
  name: string;
  schemaVersion: number;
  requestSchema: z.ZodType<TRequest>;
  responseSchema: z.ZodType<TResponse>;
  description: string;
  exampleRequest?: TRequest;
  exampleResponse?: TResponse;
  /**
   * Derive a short human-readable summary from the request+response pair.
   * Used by channel downgrades and session compact summarization.
   */
  summarize?: (payload: TRequest, response: TResponse) => string;
}

/**
 * Parsed result of a `<ask>` tag from the LLM stream.
 */
export interface ParsedAskTag {
  component: string;
  interactionId: string;
  payload: unknown;
  cancellable?: boolean;
  timeoutMs?: number;
}
