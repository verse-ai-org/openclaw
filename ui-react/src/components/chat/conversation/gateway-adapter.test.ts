import { describe, expect, it } from "vitest";
import { replayConversation } from "./reducer";
import { runEventsToCanonical } from "./gateway-adapter";

describe("conversation/gateway-adapter", () => {
  it("preserves assistant text carried by run.finished (chat.final) frames", () => {
    const threadId = "main";
    const runId = "r1";
    const full = "hello final snapshot";

    const canonical = runEventsToCanonical(
      [{ type: "run.started", sessionKey: threadId, runId }, { type: "run.finished", text: full }],
      threadId,
      runId,
      100,
    );

    const state = replayConversation(canonical, threadId);
    const msg = state.messagesById.get(`run:${runId}`);
    expect(msg?.role).toBe("assistant");
    expect(msg?.status).toBe("complete");
    expect(msg?.parts.map((p) => p.type)).toEqual(["text"]);
    expect(msg?.parts[0]).toMatchObject({ type: "text", text: full });
  });
});

