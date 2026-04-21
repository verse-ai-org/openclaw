import { describe, expect, it } from "vitest";
import type { ChatMessage, InteractiveContentBlock } from "@/store/chat.store";
import { resolveInteractiveRenderContext } from "./InteractiveParts";

function createInteractiveBlock(interactiveId: string): InteractiveContentBlock {
  return {
    type: "interactive",
    interactiveId,
    kind: "question_flow",
    payload: {
      id: "travel-preference-intake",
      steps: [],
    } as never,
  };
}

describe("InteractiveParts", () => {
  it("renders interactive block for merged same-run assistant rows", () => {
    const interactive = createInteractiveBlock("qf-1");
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "plan", ts: 1 },
      {
        id: "a1",
        role: "assistant",
        content: "",
        ts: 2,
        runId: "run-1",
        contentBlocks: [interactive],
      },
      {
        id: "a2",
        role: "assistant",
        content: "follow-up",
        ts: 3,
        runId: "run-1",
      },
    ];

    const result = resolveInteractiveRenderContext({
      messageId: "a1",
      messages,
      interactiveStreamById: new Map(),
      interactiveStreamOrder: [],
    });

    expect(result.interactiveBlocks).toHaveLength(1);
    expect(result.interactiveBlocks[0]?.interactiveId).toBe("qf-1");
  });
});
