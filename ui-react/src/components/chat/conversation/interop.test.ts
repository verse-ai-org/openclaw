import { describe, expect, it } from "vitest";
import { canonicalMessagesToChatMessages } from "./interop";
import type { CanonicalMessage } from "./types";

describe("canonicalMessagesToChatMessages", () => {
  it("maps completed tool with no serializable output to empty result so tool UI does not stay running", () => {
    const messages: CanonicalMessage[] = [
      {
        id: "m1",
        role: "assistant",
        createdAt: 1,
        status: "complete",
        parts: [
          {
            type: "tool",
            id: "call_weather",
            toolName: "weather_widget",
            args: { location: "Chongqing", dayOffset: 3 },
            status: "result",
            output: undefined,
          },
        ],
      },
    ];
    const [row] = canonicalMessagesToChatMessages(messages);
    const block = row?.contentBlocks?.[0];
    expect(block?.type).toBe("tool-call");
    if (block?.type !== "tool-call") {
      return;
    }
    expect(block.phase).toBe("result");
    expect(block.result).toBe("");
  });

  it("does not set empty result while tool is still running", () => {
    const messages: CanonicalMessage[] = [
      {
        id: "m2",
        role: "assistant",
        createdAt: 2,
        status: "running",
        parts: [
          {
            type: "tool",
            id: "call_pending",
            toolName: "web_search",
            args: { query: "x" },
            status: "running",
            output: undefined,
          },
        ],
      },
    ];
    const [row] = canonicalMessagesToChatMessages(messages);
    const block = row?.contentBlocks?.[0];
    expect(block?.type).toBe("tool-call");
    if (block?.type !== "tool-call") {
      return;
    }
    expect(block.phase).toBe("call");
    expect(block.result).toBeUndefined();
  });
});
