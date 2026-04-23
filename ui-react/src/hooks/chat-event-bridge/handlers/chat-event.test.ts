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
    interactions: {},
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

  it("finalizes empty chat.final by requesting history reload", () => {
    const ctx = createCtx();
    useChatStore.setState({
      pendingGenerationBySession: { "agent:travel:main": { runId: "run-cont" } },
      runId: "run-cont",
    });
    useChatStore.getState().upsertInteraction({
      interactionId: "route-platform-choice",
      component: "option_list",
      payload: {
        id: "route-platform-choice",
        title: "Pick",
        options: [{ id: "a", label: "A" }],
        selectionMode: "single",
      },
      schemaVersion: 1,
      status: "pending",
    });

    handleChatEvent(ctx, {
      sessionKey: "agent:travel:main",
      runId: "run-cont",
      state: "final",
    });

    const st = useChatStore.getState();
    expect(st.messages).toHaveLength(0);
    expect(st.pendingHistoryReloadKey).toBe("agent:travel:main");
    expect(st.interactions["route-platform-choice"]?.messageId).toBeUndefined();
  });
});
