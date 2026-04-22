import { describe, expect, it, vi } from "vitest";
import { createAskTagStreamParser } from "./ask-tag-parser.js";

const validQFPayload = {
  id: "qf-1",
  steps: [
    {
      id: "target",
      title: "Deploy target?",
      options: [{ id: "prod", label: "Production" }],
    },
  ],
};

describe("createAskTagStreamParser", () => {
  it("emits onComplete for a well-formed single-chunk tag", () => {
    const text = vi.fn<(s: string) => void>();
    const complete = vi.fn();
    const invalid = vi.fn();
    const parser = createAskTagStreamParser({
      onText: text,
      onComplete: complete,
      onInvalid: invalid,
    });
    parser.push(
      `prefix <ask component="question_flow" id="qf-1">${JSON.stringify(
        validQFPayload,
      )}</ask> suffix`,
    );
    parser.end();
    expect(complete).toHaveBeenCalledTimes(1);
    const [tag] = complete.mock.calls[0]!;
    expect(tag.component).toBe("question_flow");
    expect(tag.interactionId).toBe("qf-1");
    expect(tag.payload).toMatchObject({ id: "qf-1" });
    const joined = text.mock.calls.map((c) => c[0]).join("");
    expect(joined).toContain("prefix");
    expect(joined).toContain("suffix");
    expect(invalid).not.toHaveBeenCalled();
  });

  it("reassembles tag whose body arrives split across chunks", () => {
    const complete = vi.fn();
    const parser = createAskTagStreamParser({
      onText: () => {},
      onComplete: complete,
    });
    const body = JSON.stringify(validQFPayload);
    const open = `<ask component="question_flow" id="qf-1">`;
    // Split inside the JSON body — opening tag arrives whole, close tag
    // arrives whole; only the payload straddles a chunk boundary.
    parser.push(open + body.slice(0, Math.floor(body.length / 2)));
    parser.push(body.slice(Math.floor(body.length / 2)) + "</ask>");
    parser.end();
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("reports onInvalid when payload is not JSON", () => {
    const invalid = vi.fn();
    const complete = vi.fn();
    const parser = createAskTagStreamParser({
      onText: () => {},
      onComplete: complete,
      onInvalid: invalid,
    });
    parser.push(
      `<ask component="question_flow" id="qf-1">not valid json</ask>`,
    );
    parser.end();
    expect(complete).not.toHaveBeenCalled();
    expect(invalid).toHaveBeenCalledTimes(1);
    expect(invalid.mock.calls[0]![0].reason).toMatch(/invalid JSON/);
  });

  it("reports onInvalid when payload fails schema validation", () => {
    const invalid = vi.fn();
    const parser = createAskTagStreamParser({
      onText: () => {},
      onComplete: vi.fn(),
      onInvalid: invalid,
    });
    parser.push(
      `<ask component="question_flow" id="qf-1">{"id":"qf-1","steps":[]}</ask>`,
    );
    parser.end();
    expect(invalid).toHaveBeenCalledTimes(1);
    expect(invalid.mock.calls[0]![0].reason).toMatch(/validation failed/);
  });

  it("reports onInvalid for unknown component", () => {
    const invalid = vi.fn();
    const parser = createAskTagStreamParser({
      onText: () => {},
      onComplete: vi.fn(),
      onInvalid: invalid,
    });
    parser.push(`<ask component="does_not_exist" id="x">{}</ask>`);
    parser.end();
    expect(invalid).toHaveBeenCalledTimes(1);
    expect(invalid.mock.calls[0]![0].reason).toMatch(/unknown/);
  });

  it("emits unclosed tag back as plain text on end()", () => {
    const text = vi.fn<(s: string) => void>();
    const complete = vi.fn();
    const parser = createAskTagStreamParser({
      onText: text,
      onComplete: complete,
    });
    parser.push(`<ask component="question_flow" id="qf-1">{"partial":`);
    parser.end();
    expect(complete).not.toHaveBeenCalled();
    const all = text.mock.calls.map((c) => c[0]).join("");
    expect(all).toContain(`<ask`);
    expect(all).toContain(`{"partial":`);
  });
});
