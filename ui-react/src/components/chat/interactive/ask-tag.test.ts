import { describe, expect, it } from "vitest";
import { extractAskFallbackQuestions, parseAskTags, stripAllAskTags, stripValidAskTags } from "./ask-tag";

describe("ask-tag", () => {
  it("parses valid ask tag and strips only valid tags", () => {
    const text =
      'Before\n<ask component="option_list" id="ol-1">{"id":"ol-1","options":[{"id":"a","label":"A"}]}</ask>\nAfter';
    const parsed = parseAskTags(text);
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.errors).toHaveLength(0);
    expect(stripValidAskTags(text)).toBe("Before\n\nAfter");
  });

  it("accepts option_list payload with title and description", () => {
    const text =
      '<ask component="option_list" id="route-platform-choice">{' +
      '"id":"route-platform-choice",' +
      '"title":"选择路线参考平台",' +
      '"description":"你想用哪种方式获取路线推荐？",' +
      '"options":[{"id":"search","label":"搜索"},{"id":"xhs","label":"小红书"}],' +
      '"selectionMode":"single"' +
      "}</ask>";
    const parsed = parseAskTags(text);
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.errors).toHaveLength(0);
  });

  it("parses approval_card ask payload", () => {
    const text =
      '<ask component="approval_card" id="approve-delete">{' +
      '"id":"approve-delete",' +
      '"title":"Delete this workflow?",' +
      '"description":"This operation cannot be undone.",' +
      '"variant":"destructive",' +
      '"confirmLabel":"Delete",' +
      '"cancelLabel":"Keep"' +
      "}</ask>";
    const parsed = parseAskTags(text);
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0]?.kind).toBe("approval_card");
    expect(parsed.errors).toHaveLength(0);
  });

  it("keeps invalid ask tags and records parse errors", () => {
    const text = '<ask component="question_flow" id="qf-1">{invalid-json}</ask>';
    const parsed = parseAskTags(text);
    expect(parsed.blocks).toHaveLength(0);
    expect(parsed.errors[0]?.reason).toBe("invalid_json");
    expect(stripValidAskTags(text)).toBe(text);
    expect(stripAllAskTags(text)).toBe("");
  });

  it("resets regex state across sequential parses", () => {
    const valid = '<ask component="option_list" id="ol-2">{"id":"ol-2","options":[{"id":"x","label":"X"}]}</ask>';
    const first = parseAskTags(valid);
    const second = parseAskTags(valid);
    expect(first.blocks).toHaveLength(1);
    expect(second.blocks).toHaveLength(1);
  });

  it("parses legacy option_list tag as interaction fallback", () => {
    const legacy =
      '<option_list id="route-choice">{' +
      '"id":"route-choice",' +
      '"title":"请选择你想要的路线方向",' +
      '"options":[{"id":"a","label":"路线A"},{"id":"b","label":"路线B"}],' +
      '"selectionMode":"single"' +
      "}</option_list>";
    const parsed = parseAskTags(legacy);
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0]?.kind).toBe("option_list");
    expect(parsed.errors).toHaveLength(0);
  });

  it("parses legacy approval_card tag as interaction fallback", () => {
    const legacy =
      '<approval_card id="approve-delete">{' +
      '"id":"approve-delete",' +
      '"title":"Delete this workflow?",' +
      '"variant":"destructive"' +
      "}</approval_card>";
    const parsed = parseAskTags(legacy);
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0]?.kind).toBe("approval_card");
    expect(parsed.errors).toHaveLength(0);
  });

  it("extracts fallback question titles from malformed ask payload", () => {
    const text =
      '<ask component="question_flow" id="travel-preference-intake">{' +
      '"id":"travel-preference-intake",' +
      '"steps":[{"id":"budget","title":"预算档位"},{"id":"pace","title":"出行节奏"}],"oops":' +
      "}</ask>";
    expect(extractAskFallbackQuestions(text)).toEqual(["预算档位", "出行节奏"]);
  });
});
