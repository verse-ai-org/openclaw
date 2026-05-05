import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRunProjectionStore } from "@/run-projection/store";
import { useChatStore } from "@/store/chat.store";
import { handleChatEvent } from "./chat-event";
import type { BridgeRuntimeContext } from "@/components/chat/types";

vi.mock("@/components/chat/session/session-scope", () => ({
  isChatEventForActiveSession: vi.fn(() => true),
}));

function createCtx(): BridgeRuntimeContext {
  return {
    pendingInteractiveHydrationRuns: new Set<string>(),
    pendingToolResults: new Map(),
    activeRunBySession: new Map<string, string>(),
    finalizedRunBySession: new Map<string, string>(),
  };
}

function resetChatState() {
  useRunProjectionStore.getState().reset();
  useChatStore.setState({
    messages: [],
    messagesLoading: false,
    runId: null,
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
    expect(useRunProjectionStore.getState().liveCumulativeText).toBe("hello");
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

    expect(useRunProjectionStore.getState().liveCumulativeText).toBeNull();
    expect(ctx.activeRunBySession.get("agent:travel:main")).toBe("run-1");
  });
});
