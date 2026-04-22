import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "@/store/chat.store";
import { handleChatEvent } from "./chat-event";
import type { BridgeRuntimeContext } from "./shared";

vi.mock("../session-scope", () => ({
  isChatEventForActiveSession: vi.fn(() => true),
}));

function createCtx(): BridgeRuntimeContext {
  return {
    pendingInteractiveHydrationRuns: new Set<string>(),
    pendingToolResults: new Map(),
    activeRunBySession: new Map<string, string>(),
    pendingLifecycleFinalizeByRun: new Map<string, ReturnType<typeof setTimeout>>(),
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

describe("handleChatEvent", () => {
  beforeEach(() => {
    resetChatState();
  });

  it("applies delta and marks session generating", () => {
    const ctx = createCtx();
    handleChatEvent(ctx, {
      sessionKey: "agent:travel:main",
      runId: "run-1",
      state: "delta",
      message: { content: [{ type: "text", text: "hello" }] },
    });

    const st = useChatStore.getState();
    expect(st.stream).toBe("hello");
    expect(st.pendingGenerationBySession["agent:travel:main"]?.runId).toBe("run-1");
  });

  it("drops stale run events for same session", () => {
    const ctx = createCtx();
    ctx.activeRunBySession.set("agent:travel:main", "run-1");

    handleChatEvent(ctx, {
      sessionKey: "agent:travel:main",
      runId: "run-2",
      state: "delta",
      message: { content: [{ type: "text", text: "should-not-apply" }] },
    });

    const st = useChatStore.getState();
    expect(st.stream).toBeNull();
    expect(ctx.activeRunBySession.get("agent:travel:main")).toBe("run-1");
  });
});
