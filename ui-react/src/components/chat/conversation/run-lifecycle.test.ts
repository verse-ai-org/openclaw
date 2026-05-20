import { describe, expect, it } from "vitest";
import { emptyConversationState } from "./reducer";
import { applyBeginOutboundRun } from "./run-lifecycle";
import { EventType } from "./types";

describe("run-lifecycle", () => {
  it("finishes the previous active run before starting the next", () => {
    const threadId = "agent:test";
    let state = emptyConversationState(threadId);
    state = applyBeginOutboundRun(state, threadId, "run-a" as never);

    const assistantId = `run:run-a` as never;
    state = {
      ...state,
      runsById: new Map([
        [
          "run-a" as never,
          {
            id: "run-a" as never,
            threadId,
            status: "running",
            startedAt: 1,
            assistantMessageId: assistantId,
          },
        ],
      ]),
      messagesById: new Map([
        [
          assistantId,
          {
            id: assistantId,
            role: "assistant",
            createdAt: 1,
            runId: "run-a" as never,
            status: "running",
            parts: [],
          },
        ],
      ]),
      messageOrder: [assistantId],
      activeRunId: "run-a" as never,
    };

    state = applyBeginOutboundRun(state, threadId, "run-b" as never);

    expect(state.runsById.get("run-a" as never)?.status).toBe("finished");
    expect(state.activeRunId).toBe("run-b");
    expect(state.runsById.get("run-b" as never)?.status).toBe("running");
    expect(state.messagesById.get(assistantId)?.status).toBe("complete");
  });

  it("emits run.started for the outbound run", () => {
    const threadId = "agent:test";
    const state = applyBeginOutboundRun(emptyConversationState(threadId), threadId, "run-1" as never);
    expect(state.activeRunId).toBe("run-1");
    expect(state.runsById.get("run-1" as never)?.status).toBe("running");
    expect(state.eventLog.some((e) => e.type === EventType.RunStarted)).toBe(true);
  });
});
