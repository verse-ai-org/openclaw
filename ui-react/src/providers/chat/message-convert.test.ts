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

  it("strips ask tags from assistant text rendering", () => {
    const msg: ChatMessage = {
      id: "a-ask",
      role: "assistant",
      content:
        'Before\n<ask component="option_list" id="ol-1">{"id":"ol-1","options":[{"id":"a","label":"A"}]}</ask>\nAfter',
      ts: 1,
      contentBlocks: [
        {
          type: "text",
          text: 'Before\n<ask component="option_list" id="ol-1">{"id":"ol-1","options":[{"id":"a","label":"A"}]}</ask>\nAfter',
        },
      ],
    };

    const converted = convertGatewayChatMessage(msg);
    expect(converted.content).toEqual([{ type: "text", text: "Before\n\nAfter" }]);
  });

  it("strips invalid ask payload text from assistant rendering", () => {
    const msg: ChatMessage = {
      id: "a-ask-invalid",
      role: "assistant",
      content:
        'Before\n<ask component="option_list" id="ol-1">{invalid-json}</ask>\nAfter',
      ts: 1,
      contentBlocks: [
        {
          type: "text",
          text: 'Before\n<ask component="option_list" id="ol-1">{invalid-json}</ask>\nAfter',
        },
      ],
    };

    const converted = convertGatewayChatMessage(msg);
    expect(converted.content).toEqual([
      {
        type: "text",
        text: "Before\n\nAfter",
      },
    ]);
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
