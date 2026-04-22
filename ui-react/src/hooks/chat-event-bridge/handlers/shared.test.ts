import { describe, expect, it } from "vitest";
import { useChatStore } from "@/store/chat.store";
import {
  buildFinalAssistantMessage,
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

  it("avoids duplicating committed cumulative prefix in final text block", () => {
    useChatStore.setState({
      committedBlocks: [{ type: "text", text: "你好，世界" }],
      toolStreamById: new Map(),
      toolStreamOrder: [],
      interactiveStreamById: new Map(),
      interactiveStreamOrder: [],
    });

    const finalMsg = buildFinalAssistantMessage({
      text: "你好，世界！接下来我帮你规划路线。",
      runId: "run-1",
    });
    const textBlocks = finalMsg.contentBlocks?.filter((b) => b.type === "text") ?? [];
    expect(textBlocks).toHaveLength(2);
    expect(textBlocks[0]).toMatchObject({ type: "text", text: "你好，世界" });
    expect(textBlocks[1]).toMatchObject({ type: "text", text: "！接下来我帮你规划路线。" });
  });
});
