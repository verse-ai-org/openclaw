import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "@/store/chat.store";
import { handleAgentEvent } from "./agent-event";
import type { BridgeRuntimeContext } from "./shared";

vi.mock("../session-scope", () => ({
  isChatEventForActiveSession: vi.fn(() => true),
}));

function createCtx(): BridgeRuntimeContext {
  return {
    pendingInteractiveHydrationRuns: new Set<string>(),
    pendingToolResults: new Map(),
    activeRunBySession: new Map<string, string>(),
  };
}

function resetChatState() {
  useChatStore.setState({
    messages: [],
    messagesLoading: false,
    stream: null,
    runId: null,
    committedBlocks: [],
    toolStreamById: new Map(),
    toolStreamOrder: [],
    interactiveStreamById: new Map(),
    interactiveStreamOrder: [],
    interactiveSummaryById: {},
    sending: false,
    sessionKey: "agent:travel:main",
    pendingHistoryReloadKey: null,
    pendingSessionsReloadSeq: 0,
    lastError: null,
    pendingDraftMessage: null,
    pendingGenerationBySession: {},
  });
}

describe("handleAgentEvent", () => {
  beforeEach(() => {
    resetChatState();
  });

  it("finalizes a running turn when lifecycle end arrives without chat.final", () => {
    const ctx = createCtx();
    useChatStore.setState({
      stream: "draft response",
      pendingGenerationBySession: {
        "agent:travel:main": { runId: "run-1" },
      },
    });

    handleAgentEvent(ctx, {
      sessionKey: "agent:travel:main",
      runId: "run-1",
      stream: "lifecycle",
      data: { phase: "end" },
    });

    const st = useChatStore.getState();
    expect(st.stream).toBeNull();
    expect(st.messages.at(-1)?.role).toBe("assistant");
    expect(st.messages.at(-1)?.content).toContain("draft response");
    expect(st.pendingGenerationBySession["agent:travel:main"]).toBeUndefined();
  });

  it("updates in-flight tool entry on tool update phase", () => {
    const ctx = createCtx();
    useChatStore.getState().upsertToolStream({
      id: "tool-1",
      toolName: "exec",
      phase: "start",
      input: { command: "echo hi" },
    });

    handleAgentEvent(ctx, {
      sessionKey: "agent:travel:main",
      runId: "run-1",
      stream: "tool",
      data: {
        phase: "update",
        name: "exec",
        toolCallId: "tool-1",
        partialResult: { progress: "50%" },
      },
    });

    const tool = useChatStore.getState().toolStreamById.get("tool-1");
    expect(tool?.phase).toBe("running");
    expect(tool?.output).toEqual({ progress: "50%" });
  });

  it("drops stale tool progress for non-active run in same session", () => {
    const ctx = createCtx();
    ctx.activeRunBySession.set("agent:travel:main", "run-1");
    useChatStore.getState().upsertToolStream({
      id: "tool-1",
      toolName: "exec",
      phase: "start",
      input: { command: "echo hi" },
    });

    handleAgentEvent(ctx, {
      sessionKey: "agent:travel:main",
      runId: "run-2",
      stream: "tool",
      data: {
        phase: "update",
        name: "exec",
        toolCallId: "tool-1",
        partialResult: { progress: "stale" },
      },
    });

    const tool = useChatStore.getState().toolStreamById.get("tool-1");
    expect(tool?.phase).toBe("start");
    expect(tool?.output).toBeUndefined();
  });
});
