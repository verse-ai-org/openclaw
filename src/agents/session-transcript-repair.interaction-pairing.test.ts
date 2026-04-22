import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { sanitizeInteractionPairing } from "./session-transcript-repair.js";

function req(id: string, extra: Record<string, unknown> = {}): AgentMessage {
  return {
    role: "interaction_request",
    interactionId: id,
    component: "question_flow",
    payload: { id },
    timestamp: new Date().toISOString(),
    ...extra,
  } as unknown as AgentMessage;
}

function res(id: string): AgentMessage {
  return {
    role: "interaction_response",
    interactionId: id,
    component: "question_flow",
    status: "submitted",
    data: { answers: {} },
    timestamp: new Date().toISOString(),
  } as unknown as AgentMessage;
}

describe("sanitizeInteractionPairing", () => {
  it("passes through a well-formed request/response pair untouched", () => {
    const msgs: AgentMessage[] = [req("i1"), res("i1")];
    const out = sanitizeInteractionPairing(msgs);
    expect(out.droppedOrphanResponseCount).toBe(0);
    expect(out.synthesizedCancelCount).toBe(0);
    expect(out.messages).toHaveLength(2);
  });

  it("drops response rows without a matching request", () => {
    const msgs: AgentMessage[] = [res("orphan-1"), req("i2"), res("i2")];
    const out = sanitizeInteractionPairing(msgs);
    expect(out.droppedOrphanResponseCount).toBe(1);
    expect(out.messages).toHaveLength(2);
    expect(out.messages.every((m) => (m as { role: string }).role !== "interaction_response" || (m as { interactionId: string }).interactionId === "i2")).toBe(true);
  });

  it("synthesizes a cancelled response when a request has no matching response", () => {
    const msgs: AgentMessage[] = [req("i3")];
    const out = sanitizeInteractionPairing(msgs);
    expect(out.synthesizedCancelCount).toBe(1);
    expect(out.messages).toHaveLength(2);
    const last = out.messages[1] as {
      role: string;
      interactionId: string;
      status: string;
      __synthetic?: string;
    };
    expect(last.role).toBe("interaction_response");
    expect(last.interactionId).toBe("i3");
    expect(last.status).toBe("cancelled");
    expect(last.__synthetic).toBe("abandoned");
  });

  it("handles mixed transcripts: unmatched + matched + orphan responses", () => {
    const msgs: AgentMessage[] = [
      req("i-a"),
      res("i-a"),
      req("i-b"), // unmatched — will be cancelled
      res("missing"), // orphan — will be dropped
      { role: "user", content: "hi" } as unknown as AgentMessage,
    ];
    const out = sanitizeInteractionPairing(msgs);
    expect(out.droppedOrphanResponseCount).toBe(1);
    expect(out.synthesizedCancelCount).toBe(1);
    // The synthesized cancellation is inserted immediately after the
    // unmatched request, preserving the strict req→res adjacency contract.
    const roles = out.messages.map((m) => (m as { role: string }).role);
    expect(roles).toEqual([
      "interaction_request",
      "interaction_response",
      "interaction_request",
      "interaction_response",
      "user",
    ]);
  });
});
