import { describe, expect, it, vi } from "vitest";
import {
  classifyLiveTextSnapshot,
  normalizeLiveTextForPrefixCompare,
  replayConversation,
  type CanonicalChatEvent,
} from "./index";

describe("conversation reducer", () => {
  it("classifyLiveTextSnapshot: snapshot-ahead vs local-ahead-trim vs mismatch", () => {
    expect(classifyLiveTextSnapshot("hi", "hi there")).toBe("snapshot-ahead");
    expect(classifyLiveTextSnapshot("hello", "hello")).toBe("snapshot-ahead");
    expect(classifyLiveTextSnapshot("hellox", "hello")).toBe("local-ahead-trim");
    expect(classifyLiveTextSnapshot("hello", "goodbye")).toBe("mismatch");
    expect(classifyLiveTextSnapshot("hello", "hall")).toBe("mismatch");
  });

  it("classifyLiveTextSnapshot: CRLF vs LF still snapshot-ahead", () => {
    expect(classifyLiveTextSnapshot("hello", "hello\r\nworld")).toBe("snapshot-ahead");
  });

  it("normalizeLiveTextForPrefixCompare collapses CRLF and applies NFC", () => {
    expect(normalizeLiveTextForPrefixCompare("a\r\nb")).toBe("a\nb");
    expect(normalizeLiveTextForPrefixCompare("a\rb")).toBe("a\nb");
  });

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

  it("trims tiny trailing text overshoot on setLiveText instead of wiping tools when snapshot is shorter", () => {
    const threadId = "main";
    const runId = "run_trim_overshoot";

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
      { type: "tool.start", threadId, runId, ts: 3, toolCallId: "t1", toolName: "demo", args: {} },
      {
        type: "message.appendText",
        threadId,
        ts: 4,
        messageId: `run:${runId}`,
        partId: "p2",
        text: " world",
      },
      // committed "hello world" (11); throttled chat snapshot drops one trailing char
      { type: "message.setLiveText", threadId, ts: 5, messageId: `run:${runId}`, fullText: "hello worl" },
      { type: "run.finished", threadId, runId, ts: 6 },
    ];

    const state = replayConversation(events, threadId);
    const msg = state.messagesById.get(`run:${runId}`);
    expect(msg?.parts.map((p) => p.type)).toEqual(["text", "tool", "text"]);
    expect(msg?.parts[0]).toMatchObject({ type: "text", text: "hello" });
    expect(msg?.parts[1]).toMatchObject({ type: "tool", id: "t1" });
    expect(msg?.parts[2]).toMatchObject({ type: "text", text: " worl" });
  });

  it("resets message text to chat snapshot when it does not match committed prefix", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
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
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("preserves tool and tool UI parts on snapshot mismatch reset", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const threadId = "main";
      const runId = "run_mismatch_tools";
      const toolCallId = "tool_ui_1";

      const events: CanonicalChatEvent[] = [
        { type: "run.started", threadId, runId, ts: 1 },
        {
          type: "message.appendText",
          threadId,
          ts: 2,
          messageId: `run:${runId}`,
          partId: "p1",
          text: "pick one",
        },
        {
          type: "tool.start",
          threadId,
          runId,
          ts: 3,
          toolCallId,
          toolName: "choice",
          args: { options: ["a", "b"] },
        },
        {
          type: "tool.ui",
          threadId,
          runId,
          ts: 4,
          toolCallId,
          toolName: "choice",
          kind: "choice",
          payload: { id: "choice-1", options: ["a", "b"] },
        },
        {
          type: "message.setLiveText",
          threadId,
          ts: 5,
          messageId: `run:${runId}`,
          fullText: "different final body",
        },
        { type: "run.finished", threadId, runId, ts: 6 },
      ];

      const state = replayConversation(events, threadId);
      const msg = state.messagesById.get(`run:${runId}`);
      expect(msg?.parts.map((p) => p.type)).toEqual(["text", "tool"]);
      expect(msg?.parts[0]).toMatchObject({ type: "text", text: "different final body" });
      expect(msg?.parts[1]).toMatchObject({
        type: "tool",
        id: toolCallId,
        ui: { kind: "choice", payload: { id: "choice-1", options: ["a", "b"] } },
      });
      expect(state.toolPartIndex.get(toolCallId)).toEqual({
        messageId: `run:${runId}`,
        index: 1,
      });
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("RunActiveSnapshot forces the active run assistant message to be running (even after history snapshot)", () => {
    const threadId = "main";
    const runId = "run_active_1";

    const events: CanonicalChatEvent[] = [
      {
        type: "messages.snapshot",
        threadId,
        ts: 1,
        messages: [
          {
            id: `run:${runId}`,
            role: "assistant",
            createdAt: 1,
            runId,
            status: "complete",
            parts: [{ type: "text", id: "p1", text: "partial" }],
          },
        ],
      },
      {
        type: "run.activeSnapshot",
        threadId,
        ts: 2,
        runId,
        startedAt: 1,
      },
    ];

    const state = replayConversation(events, threadId);
    expect(state.activeRunId).toBe(runId);
    const msg = state.messagesById.get(`run:${runId}`);
    expect(msg?.status).toBe("running");
    expect(msg?.role).toBe("assistant");
  });
});
