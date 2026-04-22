import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { projectInteractionMessages } from "./convert-to-llm.js";
import type { InteractionRequestMessage, InteractionResponseMessage } from "./messages.js";

function makeRequest(overrides?: Partial<InteractionRequestMessage>): AgentMessage {
  return {
    role: "interaction_request",
    interactionId: "req-1",
    component: "question_flow",
    payload: { questions: [] },
    schemaVersion: 1,
    timestamp: "2025-01-01T00:00:00.000Z",
    ...overrides,
  } as unknown as AgentMessage;
}

function makeResponse(overrides?: Partial<InteractionResponseMessage>): AgentMessage {
  return {
    role: "interaction_response",
    interactionId: "req-1",
    component: "question_flow",
    status: "submitted",
    data: { answers: { q1: "yes" } },
    timestamp: "2025-01-01T00:01:00.000Z",
    ...overrides,
  } as unknown as AgentMessage;
}

describe("projectInteractionMessages", () => {
  it("passes through standard messages unchanged", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: [{ type: "text", text: "hello" }] } as unknown as AgentMessage,
      { role: "assistant", content: [{ type: "text", text: "hi" }] } as unknown as AgentMessage,
    ];
    expect(projectInteractionMessages(messages)).toEqual(messages);
  });

  it("projects interaction_request as assistant message", () => {
    const result = projectInteractionMessages([makeRequest()]);
    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe("assistant");
    const content = (result[0] as unknown as { content: Array<{ type: string; text: string }> })
      .content;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]?.type).toBe("text");
    expect(content[0]?.text).toContain("<interaction_request");
    expect(content[0]?.text).toContain('component="question_flow"');
    expect(content[0]?.text).toContain('id="req-1"');
  });

  it("projects interaction_response as user message", () => {
    const result = projectInteractionMessages([makeResponse()]);
    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe("user");
    const content = (result[0] as unknown as { content: Array<{ type: string; text: string }> })
      .content;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]?.type).toBe("text");
    expect(content[0]?.text).toContain("<interaction_response");
    expect(content[0]?.text).toContain('status="submitted"');
  });

  it("projects an interaction pair in sequence", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: [{ type: "text", text: "start" }] } as unknown as AgentMessage,
      makeRequest(),
      makeResponse(),
      { role: "user", content: [{ type: "text", text: "follow up" }] } as unknown as AgentMessage,
    ];
    const result = projectInteractionMessages(messages);
    expect(result).toHaveLength(4);
    expect(result[0]?.role).toBe("user");
    expect(result[1]?.role).toBe("assistant");
    expect(result[2]?.role).toBe("user");
    expect(result[3]?.role).toBe("user");
  });
});
