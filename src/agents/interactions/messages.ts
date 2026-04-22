import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { InteractionStatus } from "@openclaw/interactions";

/**
 * Session-transcript messages for the interaction protocol.
 *
 * We extend `@mariozechner/pi-agent-core`'s `CustomAgentMessages` via
 * declaration merging so that both roles round-trip through `SessionManager`
 * and appear as first-class `AgentMessage`s. For LLM consumption they are
 * projected to synthetic user/assistant messages inside `convertToLlm` — see
 * `projectInteractionForLlm`.
 */

export interface InteractionRequestMessage {
  role: "interaction_request";
  interactionId: string;
  component: string;
  payload: unknown;
  schemaVersion: number;
  /** Assistant runId that issued the request; used by compact/guard pairing. */
  runId?: string;
  /** Whether the user was allowed to cancel before responding. */
  cancellable?: boolean;
  timestamp: string;
}

export interface InteractionResponseMessage {
  role: "interaction_response";
  interactionId: string;
  component: string;
  status: InteractionStatus;
  /** Component-specific response payload; validated by component.responseSchema. */
  data: unknown;
  responseBy?: { userId?: string; channel?: string };
  runId?: string;
  timestamp: string;
}

declare module "@mariozechner/pi-agent-core" {
  interface CustomAgentMessages {
    interactionRequest: InteractionRequestMessage;
    interactionResponse: InteractionResponseMessage;
  }
}

export function isInteractionRequestMessage(msg: AgentMessage): msg is InteractionRequestMessage {
  return (msg as { role?: unknown }).role === "interaction_request";
}

export function isInteractionResponseMessage(msg: AgentMessage): msg is InteractionResponseMessage {
  return (msg as { role?: unknown }).role === "interaction_response";
}

/**
 * Produce the LLM-visible projection of an interaction pair. The request is
 * rendered as an assistant message (since the LLM authored it); the response
 * is rendered as a user message so the LLM sees it as structured input.
 *
 * Apps wire this up in their `convertToLlm` transform; see
 * `src/agents/interactions/convert-to-llm.ts`.
 */
export function stringifyInteractionRequestForLlm(msg: InteractionRequestMessage): string {
  return [
    `<interaction_request component="${msg.component}" id="${msg.interactionId}">`,
    JSON.stringify(msg.payload),
    `</interaction_request>`,
  ].join("\n");
}

export function stringifyInteractionResponseForLlm(msg: InteractionResponseMessage): string {
  return [
    `<interaction_response component="${msg.component}" id="${msg.interactionId}" status="${msg.status}">`,
    JSON.stringify(msg.data),
    `</interaction_response>`,
  ].join("\n");
}
