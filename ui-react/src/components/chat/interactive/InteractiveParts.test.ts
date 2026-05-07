import { describe, expect, it } from "vitest";
import type { ChatMessage, InteractiveContentBlock } from "@/components/chat/types";
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

describe("InteractiveParts / resolveInteractiveRenderContext", () => {
  it("resolves interactive block for merged same-run assistant rows", () => {
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

    const result = resolveInteractiveRenderContext({ messageId: "a1", messages });

    expect(result.interactiveBlocks).toHaveLength(1);
    expect(result.interactiveBlocks[0]?.interactiveId).toBe("qf-1");
  });

  it("does not infer interactive from plain text (no legacy <ask> path)", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "plan", ts: 1 },
      {
        id: "a1",
        role: "assistant",
        content:
          '<ask component="question_flow" id="qf-from-ask">{ "id": "qf-from-ask", "steps": [] }</ask>',
        ts: 2,
        runId: "run-1",
      },
    ];

    const result = resolveInteractiveRenderContext({ messageId: "a1", messages });

    expect(result.interactiveBlocks).toHaveLength(0);
  });

  it("loads live interactive from __stream__ maps", () => {
    const block = createInteractiveBlock("live-1");
    const byId = new Map([[block.interactiveId, block]]);
    const order = [block.interactiveId];

    const result = resolveInteractiveRenderContext({
      messageId: "__stream__",
      messages: [],
      liveInteractiveById: byId,
      liveInteractiveOrder: order,
    });

    expect(result.interactiveBlocks).toHaveLength(1);
    expect(result.interactiveBlocks[0]?.interactiveId).toBe("live-1");
  });
});
