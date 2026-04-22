import { describe, expect, it } from "vitest";
import {
  hoistAskTagsInContentBlocks,
  splitAskTags,
  stripAskTags,
} from "./ask-tag-split";

describe("splitAskTags", () => {
  it("returns the whole string as a single text part when there is no tag", () => {
    const parts = splitAskTags("hello, world");
    expect(parts).toEqual([{ kind: "text", text: "hello, world" }]);
  });

  it("empty input returns empty parts", () => {
    expect(splitAskTags("")).toEqual([]);
  });

  it("splits a single well-formed tag with an id", () => {
    const input =
      'Pick one\n<ask component="option_list" id="picker">{"id":"picker","options":[]}</ask>\nAfter.';
    const parts = splitAskTags(input);
    expect(parts).toEqual([
      { kind: "text", text: "Pick one\n" },
      { kind: "interaction", interactionId: "picker" },
      { kind: "text", text: "\nAfter." },
    ]);
  });

  it("handles multiple tags in sequence", () => {
    const input =
      '<ask component="option_list" id="a">{}</ask> middle <ask component="option_list" id="b">{}</ask>';
    const parts = splitAskTags(input);
    expect(parts).toEqual([
      { kind: "interaction", interactionId: "a" },
      { kind: "text", text: " middle " },
      { kind: "interaction", interactionId: "b" },
    ]);
  });

  it("treats single-quoted attributes correctly", () => {
    const input = "before <ask component='option_list' id='x'>{}</ask> after";
    const parts = splitAskTags(input);
    expect(parts).toEqual([
      { kind: "text", text: "before " },
      { kind: "interaction", interactionId: "x" },
      { kind: "text", text: " after" },
    ]);
  });

  it("leaves an unclosed tag as plain text so mid-stream prose is not eaten", () => {
    const input = 'some text <ask component="option_list" id="x">{';
    const parts = splitAskTags(input);
    expect(parts).toEqual([{ kind: "text", text: input }]);
  });

  it("with hideUnclosed=true, truncates an unclosed tag so partial XML is not flashed mid-stream", () => {
    const input = 'Pick one <ask component="option_list" id="x">{"id":"x"';
    const parts = splitAskTags(input, { hideUnclosed: true });
    expect(parts).toEqual([{ kind: "text", text: "Pick one " }]);
  });

  it("with hideUnclosed=true, a closed tag still splits normally", () => {
    const input = 'Pick <ask component="option_list" id="x">{}</ask> thanks';
    const parts = splitAskTags(input, { hideUnclosed: true });
    expect(parts).toEqual([
      { kind: "text", text: "Pick " },
      { kind: "interaction", interactionId: "x" },
      { kind: "text", text: " thanks" },
    ]);
  });

  it("leaves a tag without an id attribute as text (cannot bind to store)", () => {
    const input = '<ask component="option_list">{}</ask>';
    const parts = splitAskTags(input);
    expect(parts).toEqual([{ kind: "text", text: input }]);
  });

  it("ignores ask tags inside a fenced code block", () => {
    const input = [
      "pre",
      "```",
      '<ask component="option_list" id="inner">{}</ask>',
      "```",
      "post",
    ].join("\n");
    const parts = splitAskTags(input);
    // The fence + its contents appear verbatim in the text stream; no
    // interaction part should be extracted.
    expect(parts.some((p) => p.kind === "interaction")).toBe(false);
    expect(parts.map((p) => (p.kind === "text" ? p.text : "")).join("")).toBe(input);
  });

  it("preserves JSON body that contains < and >", () => {
    const input =
      '<ask component="option_list" id="k">{"range":"a<b>c","n":1}</ask>';
    const parts = splitAskTags(input);
    expect(parts).toEqual([{ kind: "interaction", interactionId: "k" }]);
  });
});

describe("stripAskTags", () => {
  it("concatenates text parts without the tag bodies", () => {
    const input =
      '先说 <ask component="question_flow" id="q">{"id":"q","steps":[]}</ask> 再说';
    expect(stripAskTags(input)).toBe("先说  再说");
  });

  it("returns input untouched when no tags present", () => {
    expect(stripAskTags("no tags here")).toBe("no tags here");
  });
});

describe("hoistAskTagsInContentBlocks", () => {
  it("returns the original array identity when nothing needs hoisting", () => {
    const blocks = [{ type: "text", text: "plain prose" } as const];
    expect(hoistAskTagsInContentBlocks(blocks)).toBe(blocks);
  });

  it("splits a text block that contains a single ask tag", () => {
    const blocks = [
      {
        type: "text",
        text: 'pre <ask component="option_list" id="x">{}</ask> post',
      } as const,
    ];
    expect(hoistAskTagsInContentBlocks(blocks)).toEqual([
      { type: "text", text: "pre " },
      { type: "interaction", interactionId: "x" },
      { type: "text", text: " post" },
    ]);
  });

  it("does not touch non-text blocks", () => {
    const blocks = [
      {
        type: "tool-call",
        toolCallId: "t1",
        toolName: "exec",
        phase: "result",
      } as const,
      {
        type: "text",
        text: '<ask component="option_list" id="x">{}</ask>',
      } as const,
      { type: "interaction", interactionId: "already" } as const,
    ];
    expect(hoistAskTagsInContentBlocks(blocks)).toEqual([
      {
        type: "tool-call",
        toolCallId: "t1",
        toolName: "exec",
        phase: "result",
      },
      { type: "interaction", interactionId: "x" },
      { type: "interaction", interactionId: "already" },
    ]);
  });

  it("handles multiple interleaved tags inside one text block", () => {
    const blocks = [
      {
        type: "text",
        text: 'A<ask component="option_list" id="a">{}</ask>B<ask component="option_list" id="b">{}</ask>C',
      } as const,
    ];
    expect(hoistAskTagsInContentBlocks(blocks)).toEqual([
      { type: "text", text: "A" },
      { type: "interaction", interactionId: "a" },
      { type: "text", text: "B" },
      { type: "interaction", interactionId: "b" },
      { type: "text", text: "C" },
    ]);
  });
});
