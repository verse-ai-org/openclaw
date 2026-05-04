import { describe, expect, it } from "vitest";
import type { ContentBlock } from "@/store/chat.store";
import {
  committedAssistantPlainPrefix,
  sliceStreamAfterCommittedAssistant,
} from "./committed-stream-prefix";

describe("committed-stream-prefix", () => {
  it("concatenates committed text blocks with no separator", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "Hello" },
      { type: "text", text: "World" },
    ];
    expect(committedAssistantPlainPrefix(blocks)).toBe("HelloWorld");
  });

  it("strips cumulative prefix matching concatenated commits", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "A" },
      { type: "text", text: "B" },
    ];
    expect(sliceStreamAfterCommittedAssistant("ABtail", blocks)).toBe("tail");
  });
});
