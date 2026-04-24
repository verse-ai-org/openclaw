import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { SessionManager } from "@mariozechner/pi-coding-agent";
import { guardSessionManager } from "./session-tool-result-guard-wrapper.js";

function createMockSessionManager() {
  const persisted: AgentMessage[] = [];
  const sessionManager = {
    appendMessage: (message: AgentMessage) => {
      persisted.push(message);
      return { id: "msg-1", message };
    },
    getSessionFile: () => null,
  } as unknown as SessionManager;
  return { sessionManager, persisted };
}

describe("guardSessionManager message metadata", () => {
  it("attaches configured metadata to persisted user messages", () => {
    const { sessionManager, persisted } = createMockSessionManager();
    const guarded = guardSessionManager(sessionManager, {
      messageMetadata: {
        interaction: {
          id: "qf-1",
          component: "question_flow",
          schemaVersion: 1,
          status: "submitted",
          payload: { answers: { destination: ["paris"] } },
          submittedAt: 1_717_171_717_000,
        },
      },
    });

    guarded.appendMessage({
      role: "user",
      content: "Q: Destination?\nA: Paris",
    } as AgentMessage);

    const user = persisted[0] as AgentMessage & {
      metadata?: { interaction?: { id?: string; component?: string } };
    };
    expect(user.metadata?.interaction?.id).toBe("qf-1");
    expect(user.metadata?.interaction?.component).toBe("question_flow");
  });

  it("does not attach metadata to assistant messages", () => {
    const { sessionManager, persisted } = createMockSessionManager();
    const guarded = guardSessionManager(sessionManager, {
      messageMetadata: {
        interaction: {
          id: "qf-1",
          component: "question_flow",
          schemaVersion: 1,
          status: "submitted",
          payload: {},
          submittedAt: 1,
        },
      },
    });

    guarded.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
    } as AgentMessage);

    const assistant = persisted[0] as AgentMessage & { metadata?: unknown };
    expect(assistant.metadata).toBeUndefined();
  });
});
