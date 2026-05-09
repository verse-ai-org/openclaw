import { describe, expect, it } from "vitest";
import { gatewayToRunEvents } from "./gateway-run-adapter";

describe("gatewayToRunEvents", () => {
  it("maps chat final to run.finished with text from message content", () => {
    const text = "done";
    const { events, sessionKey } = gatewayToRunEvents("chat", {
      runId: "r1",
      sessionKey: "agent:default:main",
      seq: 1,
      state: "final",
      message: {
        role: "assistant",
        content: [{ type: "text", text }],
        timestamp: 1,
      },
    });
    expect(sessionKey).toBe("agent:default:main");
    expect(events).toEqual([{ type: "run.finished", text }]);
  });

  it("maps chat error to run.error", () => {
    const { events } = gatewayToRunEvents("chat", {
      runId: "r1",
      sessionKey: "agent:default:main",
      seq: 1,
      state: "error",
      errorMessage: "boom",
    });
    expect(events).toEqual([{ type: "run.error", message: "boom" }]);
  });

  it("maps chat aborted to run.aborted", () => {
    const { events } = gatewayToRunEvents("chat", {
      runId: "r1",
      sessionKey: "agent:default:main",
      seq: 1,
      state: "aborted",
    });
    expect(events).toEqual([{ type: "run.aborted" }]);
  });

  it("does not emit terminal RunEvents on agent lifecycle end (chat channel is authoritative)", () => {
    const { events } = gatewayToRunEvents("agent", {
      runId: "r1",
      sessionKey: "agent:default:main",
      stream: "lifecycle",
      data: { phase: "end" },
    });
    expect(events).toEqual([]);
  });

  it("does not emit run.error on agent lifecycle error", () => {
    const { events } = gatewayToRunEvents("agent", {
      runId: "r1",
      sessionKey: "agent:default:main",
      stream: "lifecycle",
      data: { phase: "error", error: "x" },
    });
    expect(events).toEqual([]);
  });

  it("still maps lifecycle start to run.started", () => {
    const { events, sessionKey, runId } = gatewayToRunEvents("agent", {
      runId: "r1",
      sessionKey: "agent:default:main",
      stream: "lifecycle",
      data: { phase: "start" },
    });
    expect(sessionKey).toBe("agent:default:main");
    expect(runId).toBe("r1");
    expect(events).toEqual([{ type: "run.started", sessionKey: "agent:default:main", runId: "r1" }]);
  });

  it("maps agent assistant delta to text.append", () => {
    const { events, sessionKey, runId } = gatewayToRunEvents("agent", {
      runId: "r1",
      sessionKey: "agent:default:main",
      stream: "assistant",
      data: { text: "hello", delta: "lo" },
    });
    expect(sessionKey).toBe("agent:default:main");
    expect(runId).toBe("r1");
    expect(events).toEqual([{ type: "text.append", text: "lo", fullText: "hello" }]);
  });

  it("emits tool.start + tool.ui for interactive tool calls", () => {
    const { events } = gatewayToRunEvents("agent", {
      runId: "r1",
      sessionKey: "agent:default:main",
      stream: "tool",
      data: {
        phase: "start",
        toolCallId: "t1",
        name: "question_flow",
        args: {
          id: "qf",
          steps: [
            {
              id: "s1",
              title: "Pick one",
              options: [{ id: "o1", label: "A" }],
            },
          ],
        },
      },
    });
    expect(events[0]).toMatchObject({ type: "tool.start", id: "t1", name: "question_flow" });
    expect(events[1]).toMatchObject({ type: "tool.ui", id: "t1", name: "question_flow" });
  });
});
