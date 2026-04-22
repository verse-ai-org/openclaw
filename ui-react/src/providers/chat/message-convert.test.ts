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

  it("does not synthesize an empty text part for messages that only carry interaction parts", () => {
    const msg: ChatMessage = {
      id: "a-int",
      role: "assistant",
      content: "",
      ts: 1,
      contentBlocks: [{ type: "interaction", interactionId: "i1" }],
    };
    const converted = convertGatewayChatMessage(msg);
    // The interaction part is *not* carried through to assistant-ui's content
    // array (the framework doesn't know this kind and will throw on tap-lookup).
    // InteractiveParts reads it from the chat store instead — so the runtime
    // content stays empty; no empty text placeholder is inserted either.
    expect(converted.content).toEqual([]);
  });

  it("strips <ask ...>...</ask> tags from text blocks, leaving surrounding prose intact", () => {
    const msg: ChatMessage = {
      id: "a-ask",
      role: "assistant",
      content: 'pre <ask component="option_list" id="pick">{"id":"pick"}</ask> post',
      ts: 1,
      contentBlocks: [
        {
          type: "text",
          text: 'pre <ask component="option_list" id="pick">{"id":"pick"}</ask> post',
        },
      ],
    };
    const converted = convertGatewayChatMessage(msg);
    expect(converted.content).toEqual([{ type: "text", text: "pre  post" }]);
  });

  it("strips <ask> tags from the legacy flat content field when no contentBlocks exist", () => {
    const msg: ChatMessage = {
      id: "a-ask-flat",
      role: "assistant",
      content: 'hi <ask component="option_list" id="x">{}</ask>',
      ts: 1,
    };
    const converted = convertGatewayChatMessage(msg);
    expect(converted.content).toEqual([{ type: "text", text: "hi " }]);
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
