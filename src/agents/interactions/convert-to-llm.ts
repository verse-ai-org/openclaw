import type { AgentMessage } from "@mariozechner/pi-agent-core";
import {
  isInteractionRequestMessage,
  isInteractionResponseMessage,
  stringifyInteractionRequestForLlm,
  stringifyInteractionResponseForLlm,
} from "./messages.js";

/**
 * Project `interaction_request` and `interaction_response` transcript messages
 * into synthetic LLM-visible assistant/user messages.
 *
 * - `interaction_request`  → `role: "assistant"` (the LLM authored the ask)
 * - `interaction_response` → `role: "user"`      (the user answered it)
 *
 * Wire this up inside `sanitizeSessionHistory` (pi-embedded-runner/google.ts)
 * so the LLM always sees the full interaction history without relying on the
 * ephemeral `enqueueSystemEvent` bridge.
 */
export function projectInteractionMessages(messages: AgentMessage[]): AgentMessage[] {
  return messages.flatMap((msg): AgentMessage[] => {
    if (isInteractionRequestMessage(msg)) {
      return [
        {
          role: "assistant",
          content: [{ type: "text", text: stringifyInteractionRequestForLlm(msg) }],
        } as unknown as AgentMessage,
      ];
    }
    if (isInteractionResponseMessage(msg)) {
      return [
        {
          role: "user",
          content: [{ type: "text", text: stringifyInteractionResponseForLlm(msg) }],
        } as unknown as AgentMessage,
      ];
    }
    return [msg];
  });
}
