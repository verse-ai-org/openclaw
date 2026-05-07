import { describe, expect, it } from "vitest";
import { applyRunEvent, emptyRunState } from "./run-state";
import { toFinalMessage } from "./run-message";

describe("terminal run flush + toFinalMessage", () => {
  it("persists streamed-only text when run.finished carries no body", () => {
    let s = emptyRunState("agent:x:main", "run-1");
    s = applyRunEvent(s, { type: "run.started", sessionKey: "agent:x:main", runId: "run-1" });
    s = applyRunEvent(s, { type: "text.delta", text: "hello" });
    s = applyRunEvent(s, { type: "run.finished", text: undefined });

    expect(s.status).toBe("finished");
    expect(s.liveText).toBe("");
    expect(s.committedBlocks).toEqual([{ type: "text", text: "hello" }]);

    const msg = toFinalMessage(s);
    expect(msg).not.toBeNull();
    expect(msg!.content).toBe("hello");
    expect(msg!.contentBlocks).toEqual([{ type: "text", text: "hello" }]);
  });

  it("does not duplicate text when chat.final repeats streamed body", () => {
    let s = emptyRunState("agent:x:main", "run-1");
    s = applyRunEvent(s, { type: "run.started", sessionKey: "agent:x:main", runId: "run-1" });
    s = applyRunEvent(s, { type: "text.delta", text: "hello" });
    s = applyRunEvent(s, { type: "run.finished", text: "hello" });

    const msg = toFinalMessage(s);
    expect(msg!.content).toBe("hello");
    expect(msg!.contentBlocks).toEqual([{ type: "text", text: "hello" }]);
  });

  it("flushes tail after tool.start before run.finished", () => {
    let s = emptyRunState("agent:x:main", "run-1");
    s = applyRunEvent(s, { type: "run.started", sessionKey: "agent:x:main", runId: "run-1" });
    s = applyRunEvent(s, { type: "text.delta", text: "pre" });
    s = applyRunEvent(s, {
      type: "tool.start",
      id: "t1",
      name: "noop",
      args: {},
    });
    expect(s.committedBlocks.some((b) => b.type === "text" && b.text === "pre")).toBe(true);

    s = applyRunEvent(s, { type: "text.delta", text: "prepost" });
    s = applyRunEvent(s, { type: "run.finished", text: undefined });

    expect(s.liveText).toBe("");
    expect(toFinalMessage(s)?.content).toBe("prepost");
  });

  it("preserves partial assistant text on run.aborted", () => {
    let s = emptyRunState("agent:x:main", "run-1");
    s = applyRunEvent(s, { type: "run.started", sessionKey: "agent:x:main", runId: "run-1" });
    s = applyRunEvent(s, { type: "text.delta", text: "stopped" });
    s = applyRunEvent(s, { type: "run.aborted" });

    expect(s.status).toBe("aborted");
    expect(s.liveText).toBe("");
    const msg = toFinalMessage(s);
    expect(msg?.content).toBe("stopped");
  });
});
