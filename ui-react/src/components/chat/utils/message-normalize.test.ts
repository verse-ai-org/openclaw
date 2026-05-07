import { describe, expect, it } from "vitest";
import {
  extractGatewayChatMessageText,
  extractMessageText,
} from "./message-normalize";

describe("extractGatewayChatMessageText", () => {
  it("returns empty for non-objects", () => {
    expect(extractGatewayChatMessageText(null)).toBe("");
    expect(extractGatewayChatMessageText(undefined)).toBe("");
    expect(extractGatewayChatMessageText("x")).toBe("");
  });

  it("prefers top-level text field", () => {
    expect(
      extractGatewayChatMessageText({
        text: "hello",
        content: [{ type: "text", text: "ignored" }],
      }),
    ).toBe("hello");
  });

  it("concatenates text blocks in content without separators", () => {
    expect(
      extractGatewayChatMessageText({
        role: "assistant",
        content: [
          { type: "text", text: "a" },
          { type: "text", text: "b" },
        ],
      }),
    ).toBe("ab");
  });

  it("accepts string content", () => {
    expect(extractGatewayChatMessageText({ content: "plain" })).toBe("plain");
  });

  it("ignores non-text blocks in content array", () => {
    expect(
      extractGatewayChatMessageText({
        content: [{ type: "text", text: "x" }, { type: "image", url: "u" }, { type: "text", text: "y" }],
      }),
    ).toBe("xy");
  });
});

describe("extractMessageText", () => {
  it("joins multiple text blocks with newlines (history normalization)", () => {
    expect(
      extractMessageText({
        content: [
          { type: "text", text: "a" },
          { type: "text", text: "b" },
        ],
      }),
    ).toBe("a\nb");
  });
});
