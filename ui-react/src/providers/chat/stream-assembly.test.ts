import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/store/chat.store";
import {
  buildRuntimeMessages,
  mergeAssistantRunMessages,
} from "./stream-assembly";

describe("stream-assembly", () => {
  it("merges consecutive assistant messages by runId", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "hi", ts: 1 },
      {
        id: "a1",
        role: "assistant",
        content: "first",
        ts: 2,
        runId: "run-1",
        contentBlocks: [{ type: "tool-call", toolCallId: "t1", toolName: "read", phase: "call" }],
      },
      {
        id: "a2",
        role: "assistant",
        content: "second",
        ts: 3,
        runId: "run-1",
        contentBlocks: [{ type: "tool-call", toolCallId: "t2", toolName: "exec", phase: "result" }],
      },
      { id: "a3", role: "assistant", content: "other run", ts: 4, runId: "run-2" },
    ];

    const merged = mergeAssistantRunMessages(messages);

    expect(merged).toHaveLength(3);
    expect(merged[1]?.id).toBe("a1");
    expect(merged[1]?.content).toBe("first\nsecond");
    expect(merged[1]?.contentBlocks?.length).toBe(2);
    expect(merged[2]?.id).toBe("a3");
  });

  it("builds __stream__ placeholder while running", () => {
    const output = buildRuntimeMessages({
      chatMessages: [{ id: "u1", role: "user", content: "hi", ts: 1 }],
      isRunning: true,
      stream: "draft",
      committedBlocks: [{ type: "text", text: "preface" }],
      toolStreamById: new Map([
        [
          "t1",
          {
            id: "t1",
            toolName: "exec",
            phase: "running",
            input: { command: "echo hi" },
          },
        ],
      ]),
      toolStreamOrder: ["t1"],
      interactiveStreamById: new Map(),
      interactiveStreamOrder: [],
      effectiveRunId: "run-1",
    });

    expect(output).toHaveLength(2);
    const streamMessage = output[1];
    expect(streamMessage?.id).toBe("__stream__");
    expect(streamMessage?.runId).toBe("run-1");
    expect(streamMessage?.contentBlocks?.some((b) => b.type === "tool-call")).toBe(
      true,
    );
  });

  it("keeps tool calls grouped after completion when same run spans multiple assistant rows", () => {
    const completed = buildRuntimeMessages({
      chatMessages: [
        { id: "u1", role: "user", content: "plan", ts: 1 },
        {
          id: "a1",
          role: "assistant",
          content: "",
          ts: 2,
          runId: "run-1",
          contentBlocks: [
            { type: "tool-call", toolCallId: "t1", toolName: "read", phase: "result" },
          ],
        },
        {
          id: "a2",
          role: "assistant",
          content: "",
          ts: 3,
          runId: "run-1",
          contentBlocks: [
            { type: "tool-call", toolCallId: "t2", toolName: "exec", phase: "result" },
          ],
        },
      ],
      isRunning: false,
      stream: null,
      committedBlocks: [],
      toolStreamById: new Map(),
      toolStreamOrder: [],
      interactiveStreamById: new Map(),
      interactiveStreamOrder: [],
      effectiveRunId: null,
    });

    expect(completed).toHaveLength(2);
    const assistant = completed[1];
    expect(assistant?.runId).toBe("run-1");
    const toolBlocks = assistant?.contentBlocks?.filter((b) => b.type === "tool-call");
    expect(toolBlocks).toHaveLength(2);
  });

  it("does not merge assistant rows across user boundary even with same runId", () => {
    const merged = mergeAssistantRunMessages([
      {
        id: "a1",
        role: "assistant",
        content: "step 1",
        ts: 1,
        runId: "run-1",
      },
      { id: "u1", role: "user", content: "follow-up", ts: 2 },
      {
        id: "a2",
        role: "assistant",
        content: "step 2",
        ts: 3,
        runId: "run-1",
      },
    ]);

    expect(merged).toHaveLength(3);
    expect(merged[0]?.id).toBe("a1");
    expect(merged[2]?.id).toBe("a2");
  });
});
