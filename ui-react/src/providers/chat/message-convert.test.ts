import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/store/chat.store";
import { convertGatewayChatMessage } from "./message-convert";

describe("message-convert", () => {
  it("strips wrapper tags from text blocks", () => {
    const msg: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "<final>Hello</final>",
      ts: 1,
      contentBlocks: [{ type: "text", text: "<final>Hello</final>" }],
    };

    const converted = convertGatewayChatMessage(msg);
    expect(converted.role).toBe("assistant");
    expect(converted.content).toEqual([{ type: "text", text: "Hello" }]);
  });

  it("prefers embedded final wrapper body over prelude text", () => {
    const msg: ChatMessage = {
      id: "a1b",
      role: "assistant",
      content: "Intro text\n<final>Authoritative text</final>",
      ts: 1,
      contentBlocks: [
        {
          type: "text",
          text: "Intro text\n<final>Authoritative text</final>",
        },
      ],
    };

    const converted = convertGatewayChatMessage(msg);
    expect(converted.content).toEqual([{ type: "text", text: "Authoritative text" }]);
  });

  it("converts tool-call blocks into assistant-ui tool parts", () => {
    const msg: ChatMessage = {
      id: "a2",
      role: "assistant",
      content: "",
      ts: 2,
      contentBlocks: [
        {
          type: "tool-call",
          toolCallId: "tool-1",
          toolName: "exec",
          argsText: '{"command":"pwd"}',
          result: "ok",
          phase: "result",
        },
      ],
    };

    const converted = convertGatewayChatMessage(msg);
    expect(converted.content).toEqual([
      {
        type: "tool-call",
        toolCallId: "tool-1",
        toolName: "exec",
        args: { command: "pwd" },
        result: "ok",
        isError: false,
      },
    ]);
  });
});
