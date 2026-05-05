import { describe, expect, it } from "vitest";
import {
  toRunEventKindFromChatState,
  toRunEventKindFromLifecyclePhase,
  toToolCallBlockPhase,
} from "./shared";

describe("shared mapping helpers", () => {
  it("maps chat state to run event kind", () => {
    expect(toRunEventKindFromChatState("delta")).toBe("progress");
    expect(toRunEventKindFromChatState("final")).toBe("terminal");
    expect(toRunEventKindFromChatState("error")).toBe("terminal");
    expect(toRunEventKindFromChatState("aborted")).toBe("terminal");
  });

  it("maps lifecycle phase to run event kind", () => {
    expect(toRunEventKindFromLifecyclePhase("start")).toBe("start");
    expect(toRunEventKindFromLifecyclePhase("end")).toBe("terminal");
    expect(toRunEventKindFromLifecyclePhase("error")).toBe("terminal");
    expect(toRunEventKindFromLifecyclePhase("update")).toBe("progress");
  });

  it("maps tool stream phase to content block phase", () => {
    expect(toToolCallBlockPhase("start")).toBe("call");
    expect(toToolCallBlockPhase("running")).toBe("call");
    expect(toToolCallBlockPhase("result")).toBe("result");
    expect(toToolCallBlockPhase("error")).toBe("error");
  });
});
