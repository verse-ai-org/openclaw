import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/store/chat.store";
import {
  INTERACTION_RENDERERS,
  extractInteractionIds,
  extractInteractionIdsForRun,
} from "./InteractiveParts";

describe("InteractiveParts — extractInteractionIds", () => {
  it("returns empty for undefined message", () => {
    expect(extractInteractionIds(undefined)).toEqual([]);
  });

  it("returns empty for a message without contentBlocks", () => {
    const msg: ChatMessage = { id: "a1", role: "assistant", content: "", ts: 1 };
    expect(extractInteractionIds(msg)).toEqual([]);
  });

  it("picks interaction parts in block order, ignores other block types", () => {
    const msg: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "",
      ts: 1,
      contentBlocks: [
        { type: "text", text: "before" },
        { type: "interaction", interactionId: "i1" },
        {
          type: "tool-call",
          toolCallId: "t",
          toolName: "exec",
          phase: "call",
        },
        { type: "interaction", interactionId: "i2" },
        { type: "text", text: "after" },
      ],
    };
    expect(extractInteractionIds(msg)).toEqual(["i1", "i2"]);
  });
});

describe("InteractiveParts — extractInteractionIdsForRun", () => {
  it("aggregates interaction blocks across store rows sharing a runId", () => {
    // Simulates the history-reload case where the gateway strips outer ids
    // and assistant rows that the runtime merges into one bubble stay
    // un-merged in the store.
    const msgs: ChatMessage[] = [
      { id: "u", role: "user", content: "hi", ts: 0 },
      {
        id: "a1",
        role: "assistant",
        content: "",
        ts: 1,
        runId: "run-X",
        contentBlocks: [
          { type: "tool-call", toolCallId: "t1", toolName: "read", phase: "call" },
        ],
      },
      {
        id: "a2",
        role: "assistant",
        content: "",
        ts: 2,
        runId: "run-X",
        contentBlocks: [
          { type: "text", text: "你好呀" },
          { type: "interaction", interactionId: "travel-preference-intake" },
        ],
      },
      {
        id: "a3",
        role: "assistant",
        content: "",
        ts: 3,
        runId: "run-OTHER",
        contentBlocks: [
          { type: "interaction", interactionId: "other-run-ignored" },
        ],
      },
    ];
    // anchor = first row of run-X; merged bubble in assistant-ui uses id a1.
    expect(extractInteractionIdsForRun(msgs, "a1")).toEqual([
      "travel-preference-intake",
    ]);
  });

  it("falls back to the single message when there is no runId", () => {
    const msg: ChatMessage = {
      id: "a",
      role: "assistant",
      content: "",
      ts: 1,
      contentBlocks: [
        { type: "interaction", interactionId: "inline" },
      ],
    };
    expect(extractInteractionIdsForRun([msg], "a")).toEqual(["inline"]);
  });

  it("returns empty when the anchor is not found", () => {
    expect(extractInteractionIdsForRun([], "missing")).toEqual([]);
  });
});

describe("InteractiveParts — renderer registry", () => {
  it("only registers the two built-in components", () => {
    expect(Object.keys(INTERACTION_RENDERERS).sort()).toEqual([
      "option_list",
      "question_flow",
    ]);
  });
});
