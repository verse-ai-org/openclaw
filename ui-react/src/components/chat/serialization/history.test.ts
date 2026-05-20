import { describe, expect, it } from "vitest";
import type { RawMessage } from "@/components/chat/types";
import { serializeGatewayHistoryToCanonicalSnapshot } from "./history";

describe("serialization/history", () => {
  it("does not drop out-of-order toolResult rows", () => {
    const runId = "run-1";
    const messages: RawMessage[] = [
      // toolResult arrives before the assistant/toolCall that it belongs to.
      {
        role: "toolResult",
        runId,
        timestamp: 2,
        // history rows can include toolCallId/toolName at the top-level (not inside content[])
        // even though RawMessage doesn't type these fields.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      {
        role: "assistant",
        runId,
        timestamp: 3,
        content: [
          {
            type: "toolCall",
            id: "call_1",
            name: "option_list",
            arguments: { id: "x" },
          },
        ],
      },
    ];

    // Patch in toolResult fields on the first message (avoid widening RawMessage type).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[0] as any).toolCallId = "call_1";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[0] as any).toolName = "option_list";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[0] as any).content = [
      {
        type: "text",
        text: JSON.stringify(
          {
            id: "active-trip-choice",
            selectionMode: "single",
            options: [
              { id: "a", label: "A" },
              { id: "b", label: "B" },
            ],
          },
          null,
          2,
        ),
      },
    ];

    const { messages: snapshot } = serializeGatewayHistoryToCanonicalSnapshot({
      threadId: "agent:test",
      messages,
    });

    const assistant = snapshot.find((m) => m.role === "assistant" && m.runId === runId);
    expect(assistant).toBeTruthy();
    expect(assistant?.parts.some((p) => p.type === "tool" && p.id === "call_1")).toBe(true);

    const toolPart = assistant?.parts.find((p) => p.type === "tool" && p.id === "call_1");
    expect(toolPart && toolPart.type === "tool" ? toolPart.ui?.kind : null).toBe("option_list");
  });

  it("interleaves text and tools based on assistant content ordering", () => {
    const runId = "run-3";
    const messages: RawMessage[] = [
      {
        role: "assistant",
        runId,
        timestamp: 10,
        content: [
          { type: "text", text: "before" },
          { type: "toolCall", id: "call_x", name: "option_list", arguments: { id: "x" } },
          { type: "text", text: "after" },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { role: "toolResult", runId, timestamp: 11 } as any,
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[1] as any).toolCallId = "call_x";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[1] as any).toolName = "option_list";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[1] as any).content = [
      {
        type: "text",
        text: JSON.stringify(
          {
            id: "x",
            selectionMode: "single",
            options: [{ id: "a", label: "A" }],
          },
          null,
          2,
        ),
      },
    ];

    const { messages: snapshot } = serializeGatewayHistoryToCanonicalSnapshot({
      threadId: "agent:test",
      messages,
    });
    const assistant = snapshot.find((m) => m.role === "assistant" && m.runId === runId);
    expect(assistant).toBeTruthy();
    const parts = assistant?.parts ?? [];
    expect(parts.map((p) => p.type)).toEqual(["text", "tool", "text"]);
    expect(parts[0]?.type === "text" ? parts[0].text : "").toContain("before");
    expect(parts[2]?.type === "text" ? parts[2].text : "").toContain("after");
  });

  it("renders tool-only runs (no assistant toolCall marker)", () => {
    const runId = "run-4";
    const messages: RawMessage[] = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { role: "toolResult", runId, timestamp: 5 } as any,
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[0] as any).toolCallId = "call_only";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[0] as any).toolName = "option_list";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[0] as any).content = [
      {
        type: "text",
        text: JSON.stringify(
          {
            id: "only",
            selectionMode: "single",
            options: [{ id: "a", label: "A" }],
          },
          null,
          2,
        ),
      },
    ];

    const { messages: snapshot } = serializeGatewayHistoryToCanonicalSnapshot({
      threadId: "agent:test",
      messages,
    });

    const assistant = snapshot.find((m) => m.role === "assistant" && m.runId === runId);
    expect(assistant).toBeTruthy();
    expect(assistant?.parts.map((p) => p.type)).toEqual(["tool"]);
    const toolPart = assistant?.parts[0];
    expect(toolPart && toolPart.type === "tool" ? toolPart.ui?.kind : null).toBe("option_list");
  });

  it("merges adjacent assistant segments for the same run into one canonical message (matches live reducer id)", () => {
    const runId = "run-5";
    const messages: RawMessage[] = [
      {
        id: "a1",
        role: "assistant",
        runId,
        timestamp: 1,
        content: [{ type: "text", text: "first" }],
      },
      {
        id: "a2",
        role: "assistant",
        runId,
        timestamp: 2,
        content: [{ type: "text", text: "second" }],
      },
    ];

    const { messages: snapshot } = serializeGatewayHistoryToCanonicalSnapshot({
      threadId: "agent:test",
      messages,
    });
    const assistants = snapshot.filter((m) => m.role === "assistant" && m.runId === runId);
    expect(assistants).toHaveLength(1);
    expect(assistants[0]?.id).toBe(`run:${runId}`);
    const texts = assistants[0]?.parts.filter((p) => p.type === "text").map((p) => (p.type === "text" ? p.text : ""));
    expect(texts.join("\n")).toContain("first");
    expect(texts.join("\n")).toContain("second");
  });

  it("does not duplicate interactive cards across assistant run folding", () => {
    const runId = "run-6";
    const messages: RawMessage[] = [
      {
        id: "m1",
        role: "assistant",
        runId,
        timestamp: 1,
        content: [
          { type: "text", text: "intro" },
          { type: "toolCall", id: "call_i", name: "question_flow", arguments: { id: "q" } },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { role: "toolResult", runId, timestamp: 2 } as any,
      {
        id: "m2",
        role: "assistant",
        runId,
        timestamp: 3,
        content: [{ type: "text", text: "tail" }],
      },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[1] as any).toolCallId = "call_i";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[1] as any).toolName = "question_flow";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[1] as any).content = [
      {
        type: "text",
        text: JSON.stringify(
          {
            id: "q",
            steps: [
              {
                id: "s1",
                title: "T",
                selectionMode: "single",
                options: [{ id: "a", label: "A" }],
              },
            ],
          },
          null,
          2,
        ),
      },
    ];

    const { messages: snapshot } = serializeGatewayHistoryToCanonicalSnapshot({
      threadId: "agent:test",
      messages,
    });
    const merged = snapshot.find((m) => m.role === "assistant" && m.runId === runId);
    expect(merged?.id).toBe(`run:${runId}`);
    const toolParts = merged?.parts.filter((p) => p.type === "tool" && p.id === "call_i") ?? [];
    expect(toolParts).toHaveLength(1);
    expect(merged?.parts.some((p) => p.type === "text" && p.text.includes("intro"))).toBe(true);
    expect(merged?.parts.some((p) => p.type === "text" && p.text.includes("tail"))).toBe(true);
  });

  it("filters internal tools from history (session_status)", () => {
    const runId = "run-2";
    const messages: RawMessage[] = [
      {
        role: "assistant",
        runId,
        timestamp: 10,
        content: [
          { type: "toolCall", id: "call_s", name: "session_status", arguments: {} },
          { type: "text", text: "hello" },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { role: "toolResult", runId, timestamp: 11 } as any,
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[1] as any).toolCallId = "call_s";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[1] as any).toolName = "session_status";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[1] as any).content = [{ type: "text", text: "NOISE" }];

    const { messages: snapshot } = serializeGatewayHistoryToCanonicalSnapshot({
      threadId: "agent:test",
      messages,
    });
    const assistant = snapshot.find((m) => m.role === "assistant" && m.runId === runId);
    expect(assistant).toBeTruthy();
    expect(assistant?.parts.some((p) => p.type === "tool")).toBe(false);
  });

  it("folds runtime tools (exec/read) to the last assistant message in the run", () => {
    const runId = "run-7";
    const messages: RawMessage[] = [
      {
        id: "m1",
        role: "assistant",
        runId,
        timestamp: 1,
        content: [{ type: "toolCall", id: "call_exec", name: "exec", arguments: { command: "echo hi" } }],
      },
      {
        id: "m2",
        role: "assistant",
        runId,
        timestamp: 3,
        content: [{ type: "text", text: "tail" }],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { role: "toolResult", runId, timestamp: 2 } as any,
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[2] as any).toolCallId = "call_exec";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[2] as any).toolName = "exec";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[2] as any).content = [{ type: "text", text: "ok" }];

    const { messages: snapshot } = serializeGatewayHistoryToCanonicalSnapshot({ threadId: "agent:test", messages });
    const merged = snapshot.find((m) => m.role === "assistant" && m.runId === runId);
    expect(merged?.id).toBe(`run:${runId}`);
    expect(merged?.parts.some((p) => p.type === "tool" && p.id === "call_exec")).toBe(true);
    expect(merged?.parts.some((p) => p.type === "text" && p.text.includes("tail"))).toBe(true);
  });

  it("keeps user messages when gateway uses role=human", () => {
    const messages: RawMessage[] = [
      {
        role: "human",
        timestamp: 1,
        content: [{ type: "text", text: "计划一个川西5日游" }],
      },
      {
        role: "assistant",
        runId: "run-1",
        timestamp: 2,
        content: [{ type: "text", text: "ok" }],
      },
    ];

    const { messages: snapshot } = serializeGatewayHistoryToCanonicalSnapshot({
      threadId: "agent:test",
      messages,
    });

    const user = snapshot.find((m) => m.role === "user");
    expect(user).toBeTruthy();
    expect(user?.parts[0]?.type === "text" ? user.parts[0].text : "").toContain("川西5日游");
  });

  it("emits synthetic finished runs from gateway runId timestamps (for UI run duration)", () => {
    const runId = "run-duration-1";
    const messages: RawMessage[] = [
      { role: "assistant", runId, timestamp: 100, content: [{ type: "text", text: "a" }] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { role: "toolResult", runId, timestamp: 500 } as any,
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[1] as any).toolCallId = "t1";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[1] as any).toolName = "read";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[1] as any).content = [{ type: "text", text: "done" }];

    const { messages: canonical, runs } = serializeGatewayHistoryToCanonicalSnapshot({
      threadId: "agent:test",
      messages,
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      id: runId,
      status: "finished",
      startedAt: 100,
      finishedAt: 500,
      assistantMessageId: `run:${runId}`,
    });
    expect(canonical.some((m) => m.runId === runId)).toBe(true);
  });

  it("treats policy-blocked tool bodies as errors when history has isError false (SSRFetch-style)", () => {
    const runId = "run-blocked-1";
    const messages: RawMessage[] = [
      {
        role: "assistant",
        runId,
        timestamp: 1,
        content: [
          {
            type: "toolCall",
            id: "call_fetch",
            name: "web_fetch",
            arguments: { url: "https://example.com", maxChars: 8000 },
          },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { role: "toolResult", runId, timestamp: 2, isError: false } as any,
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[1] as any).toolCallId = "call_fetch";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[1] as any).toolName = "web_fetch";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messages[1] as any).content = [
      {
        type: "text",
        text: "Blocked: resolves to private/internal/special-use IP address",
      },
    ];

    const { messages: canonical } = serializeGatewayHistoryToCanonicalSnapshot({
      threadId: "agent:test",
      messages,
    });
    const assistant = canonical.find((m) => m.role === "assistant" && m.runId === runId);
    const toolPart = assistant?.parts.find((p) => p.type === "tool" && p.id === "call_fetch");
    expect(toolPart && toolPart.type === "tool" ? toolPart.status : "").toBe("error");
  });
});
