import { beforeEach, describe, expect, it } from "vitest";
import { resolvePersistRunId, useChatStore } from "@/store/chat.store";

function baselineState(): Partial<ReturnType<typeof useChatStore.getState>> {
  return {
    messages: [],
    stream: null,
    runId: null,
    committedBlocks: [],
    toolStreamById: new Map(),
    toolStreamOrder: [],
    interactiveStreamById: new Map(),
    interactiveStreamOrder: [],
    interactions: {},
    sessionKey: null,
    pendingGenerationBySession: {},
    sending: false,
  };
}

describe("resolvePersistRunId", () => {
  it("prefers top-level runId when set", () => {
    expect(
      resolvePersistRunId({
        runId: " top ",
        sessionKey: "main",
        pendingGenerationBySession: { main: { runId: "pending" } },
      }),
    ).toBe("top");
  });

  it("falls back to pendingGenerationBySession for active sessionKey", () => {
    expect(
      resolvePersistRunId({
        runId: null,
        sessionKey: "agent:x:y",
        pendingGenerationBySession: { "agent:x:y": { runId: "run-99" } },
      }),
    ).toBe("run-99");
  });

  it("returns undefined when nothing is set", () => {
    expect(
      resolvePersistRunId({
        runId: null,
        sessionKey: "main",
        pendingGenerationBySession: {},
      }),
    ).toBeUndefined();
  });
});

describe("finalizeStream(runId)", () => {
  beforeEach(() => {
    useChatStore.setState(baselineState());
  });

  it("persists event run id after pending generation was cleared (matches finalizeChatRun order)", () => {
    const toolId = "call_1";
    useChatStore.setState({
      sessionKey: "agent:demo:s1",
      pendingGenerationBySession: {
        "agent:demo:s1": { runId: "should-be-cleared" },
      },
      toolStreamOrder: [toolId],
      toolStreamById: new Map([
        [
          toolId,
          {
            id: toolId,
            toolName: "exec",
            phase: "result",
            output: "ok",
          },
        ],
      ]),
    });
    useChatStore.getState().clearSessionGenerating("agent:demo:s1");
    expect(
      useChatStore.getState().pendingGenerationBySession["agent:demo:s1"],
    ).toBeUndefined();

    useChatStore.getState().finalizeStream("gateway-run-abc");

    const msg = useChatStore.getState().messages.at(-1);
    expect(msg?.role).toBe("assistant");
    expect(msg?.runId).toBe("gateway-run-abc");
    expect(msg?.contentBlocks?.some((b) => b.type === "tool-call")).toBe(true);
  });

  it("leaves runId unset when no event id and pending was already cleared", () => {
    const toolId = "call_1";
    useChatStore.setState({
      sessionKey: "agent:demo:s1",
      toolStreamOrder: [toolId],
      toolStreamById: new Map([
        [
          toolId,
          {
            id: toolId,
            toolName: "exec",
            phase: "result",
            output: "ok",
          },
        ],
      ]),
    });
    useChatStore.getState().finalizeStream();

    const msg = useChatStore.getState().messages.at(-1);
    expect(msg?.runId).toBeUndefined();
  });
});
