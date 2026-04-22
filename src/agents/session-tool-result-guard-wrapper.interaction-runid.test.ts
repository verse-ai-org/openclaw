import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { guardSessionManager } from "./session-tool-result-guard-wrapper.js";

function getPersistedMessages(sm: ReturnType<typeof SessionManager.inMemory>) {
  return sm
    .getEntries()
    .filter((e) => e.type === "message")
    .map((e) => (e as { message: AgentMessage }).message);
}

describe("guardSessionManager (interaction roles)", () => {
  it("tags interaction_request with the runId on persistence", () => {
    const sm = guardSessionManager(SessionManager.inMemory(), { runId: "run-42" });
    const append = sm.appendMessage.bind(sm) as unknown as (m: AgentMessage) => void;
    append({
      role: "interaction_request",
      interactionId: "i1",
      component: "question_flow",
      payload: { id: "i1" },
    } as unknown as AgentMessage);
    const [row] = getPersistedMessages(sm);
    expect((row as { role: string }).role).toBe("interaction_request");
    expect((row as { runId?: string }).runId).toBe("run-42");
  });

  it("tags interaction_response with the runId on persistence", () => {
    const sm = guardSessionManager(SessionManager.inMemory(), { runId: "run-99" });
    const append = sm.appendMessage.bind(sm) as unknown as (m: AgentMessage) => void;
    append({
      role: "interaction_response",
      interactionId: "i1",
      component: "question_flow",
      status: "submitted",
      data: {},
    } as unknown as AgentMessage);
    const [row] = getPersistedMessages(sm);
    expect((row as { role: string }).role).toBe("interaction_response");
    expect((row as { runId?: string }).runId).toBe("run-99");
  });

  it("does NOT overwrite an existing runId on an interaction row", () => {
    const sm = guardSessionManager(SessionManager.inMemory(), { runId: "run-new" });
    const append = sm.appendMessage.bind(sm) as unknown as (m: AgentMessage) => void;
    append({
      role: "interaction_request",
      interactionId: "i2",
      component: "option_list",
      payload: { id: "i2" },
      runId: "run-preserved",
    } as unknown as AgentMessage);
    const [row] = getPersistedMessages(sm);
    expect((row as { runId?: string }).runId).toBe("run-preserved");
  });
});
