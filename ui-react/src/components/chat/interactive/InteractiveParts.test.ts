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
    expect(result.askParseFailed).toBe(false);
    expect(result.askParseErrorReasons).toEqual([]);
  });

  it("extracts interactive block from ask tag in assistant text", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "plan", ts: 1 },
      {
        id: "a1",
        role: "assistant",
        content:
          '<ask component="question_flow" id="qf-from-ask">{\n' +
          '  "id": "qf-from-ask",\n' +
          '  "steps": [\n' +
          '    {\n' +
          '      "id": "dest",\n' +
          '      "title": "Destination?",\n' +
          '      "options": [{ "id": "paris", "label": "Paris" }]\n' +
          "    }\n" +
          "  ]\n" +
          "}</ask>",
        ts: 2,
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
    expect(result.interactiveBlocks[0]?.interactiveId).toBe("qf-from-ask");
    expect(result.interactiveBlocks[0]?.kind).toBe("question_flow");
    expect(result.askParseFailed).toBe(false);
  });

  it("extracts approval_card block from ask tag in assistant text", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "delete workflow", ts: 1 },
      {
        id: "a1",
        role: "assistant",
        content:
          '<ask component="approval_card" id="approve-delete">{\n' +
          '  "id": "approve-delete",\n' +
          '  "title": "Delete workflow?",\n' +
          '  "description": "This cannot be undone.",\n' +
          '  "variant": "destructive"\n' +
          "}</ask>",
        ts: 2,
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
    expect(result.interactiveBlocks[0]?.interactiveId).toBe("approve-delete");
    expect(result.interactiveBlocks[0]?.kind).toBe("approval_card");
    expect(result.askParseFailed).toBe(false);
  });

  it("flags ask parse failure when ask tag is invalid", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "plan", ts: 1 },
      {
        id: "a1",
        role: "assistant",
        content: '<ask component="question_flow" id="bad">{invalid-json}</ask>',
        ts: 2,
        runId: "run-1",
      },
    ];

    const result = resolveInteractiveRenderContext({
      messageId: "a1",
      messages,
      interactiveStreamById: new Map(),
      interactiveStreamOrder: [],
    });

    expect(result.interactiveBlocks).toHaveLength(0);
    expect(result.askParseFailed).toBe(true);
    expect(result.askParseErrorReasons).toContain("invalid_json");
  });
});
