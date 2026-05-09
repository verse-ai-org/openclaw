import { describe, expect, it } from "vitest";
import { replayConversation, type CanonicalChatEvent } from "./index";

describe("conversation reducer", () => {
  it("replays a run with live text + tool lifecycle into ordered parts", () => {
    const threadId = "main";
    const runId = "run_1";
    const toolCallId = "tool_1";

    const events: CanonicalChatEvent[] = [
      { type: "run.started", threadId, runId, ts: 1 },
      { type: "message.setLiveText", threadId, ts: 2, messageId: `run:${runId}`, fullText: "hello" },
      { type: "tool.start", threadId, runId, ts: 3, toolCallId, toolName: "search", args: { q: "x" } },
      { type: "tool.update", threadId, runId, ts: 4, toolCallId, partialOutput: { progress: 0.5 } },
      { type: "message.setLiveText", threadId, ts: 5, messageId: `run:${runId}`, fullText: "hello world" },
      { type: "tool.result", threadId, runId, ts: 6, toolCallId, output: { ok: true } },
      { type: "run.finished", threadId, runId, ts: 7 },
    ];

    const state = replayConversation(events, threadId);
    const msgId = `run:${runId}`;
    const msg = state.messagesById.get(msgId);
    expect(msg).toBeTruthy();
    expect(msg?.status).toBe("complete");
    expect(msg?.parts.map((p) => p.type)).toEqual(["text", "tool", "text"]);
    expect(msg?.parts[0]).toMatchObject({ type: "text", text: "hello" });
    expect(msg?.parts[1]).toMatchObject({
      type: "tool",
      id: toolCallId,
      toolName: "search",
      status: "result",
    });
    expect(msg?.parts[2]).toMatchObject({ type: "text", text: " world" });
  });

  it("uses chat fullText only as tail when appendText already committed a prefix", () => {
    const threadId = "main";
    const runId = "run_2";

    const events: CanonicalChatEvent[] = [
      { type: "run.started", threadId, runId, ts: 1 },
      // agent assistant delta path (true append)
      {
        type: "message.appendText",
        threadId,
        ts: 2,
        messageId: `run:${runId}`,
        partId: "p1",
        text: "hello",
      },
      // chat snapshot path (cumulative full text)
      { type: "message.setLiveText", threadId, ts: 3, messageId: `run:${runId}`, fullText: "hello world" },
      { type: "run.finished", threadId, runId, ts: 4 },
    ];

    const state = replayConversation(events, threadId);
    const msg = state.messagesById.get(`run:${runId}`);
    expect(msg?.parts.map((p) => p.type)).toEqual(["text", "text"]);
    expect(msg?.parts[0]).toMatchObject({ type: "text", text: "hello" });
    expect(msg?.parts[1]).toMatchObject({ type: "text", text: " world" });
  });

  it("resets message text to chat snapshot when it does not match committed prefix", () => {
    const threadId = "main";
    const runId = "run_3";

    const events: CanonicalChatEvent[] = [
      { type: "run.started", threadId, runId, ts: 1 },
      {
        type: "message.appendText",
        threadId,
        ts: 2,
        messageId: `run:${runId}`,
        partId: "p1",
        text: "hello",
      },
      // mismatch: snapshot does not startWith committed prefix
      { type: "message.setLiveText", threadId, ts: 3, messageId: `run:${runId}`, fullText: "goodbye" },
      { type: "run.finished", threadId, runId, ts: 4 },
    ];

    const state = replayConversation(events, threadId);
    const msg = state.messagesById.get(`run:${runId}`);
    expect(msg?.parts.map((p) => p.type)).toEqual(["text"]);
    expect(msg?.parts[0]).toMatchObject({ type: "text", text: "goodbye" });
  });
});
