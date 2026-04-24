import { describe, expect, it } from "vitest";
import { formatQaDisplayText, parseQaPairsFromMessage } from "./qa-format";

describe("qa-format", () => {
  it("formats pairs as Q/A blocks", () => {
    const text = formatQaDisplayText([
      { question: "Where to?", answer: "Paris" },
      { question: "Who joins?", answer: "Solo" },
    ]);

    expect(text).toBe("Q: Where to?\nA: Paris\n\nQ: Who joins?\nA: Solo");
  });

  it("uses dash when answer is empty", () => {
    const text = formatQaDisplayText([
      { question: "Where to?", answer: "" },
    ]);
    expect(text).toBe("Q: Where to?\nA: —");
  });

  it("parses Q/A blocks from message text", () => {
    const pairs = parseQaPairsFromMessage(
      "Q: Where are you thinking of going?\nA: Not sure yet - help me decide\n\nQ: Who's coming along?\nA: Solo",
    );

    expect(pairs).toEqual([
      {
        question: "Where are you thinking of going?",
        answer: "Not sure yet - help me decide",
      },
      { question: "Who's coming along?", answer: "Solo" },
    ]);
  });
});
