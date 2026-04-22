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
    interactions: {},
    sending: false,
    sessionKey: "agent:s1:main",
    pendingHistoryReloadKey: null,
    pendingSessionsReloadSeq: 0,
    lastError: null,
    pendingDraftMessage: null,
    pendingGenerationBySession: {},
  });
}

describe("handleAgentEvent — stream=interaction", () => {
  beforeEach(() => {
    resetChatState();
  });

  it("upserts a pending interaction + commits current text on request phase", () => {
    const ctx = createCtx();
    useChatStore.setState({ stream: "hey here's a question:" });

    handleAgentEvent(ctx, {
      sessionKey: "agent:s1:main",
      runId: "run-1",
      stream: "interaction",
      data: {
        phase: "request",
        interactionId: "i1",
        component: "question_flow",
        payload: { id: "i1" },
        schemaVersion: 1,
      },
    });

    const st = useChatStore.getState();
    expect(st.interactions.i1?.status).toBe("pending");
    expect(st.interactions.i1?.component).toBe("question_flow");
    // commitCurrentText fired → stream is empty + committedBlocks has the text
    expect(st.stream).toBe("");
    expect(st.committedBlocks.at(-1)).toEqual({
      type: "text",
      text: "hey here's a question:",
    });
  });

  it("promotes new run on interaction request when lifecycle start arrives late", () => {
    const ctx = createCtx();
    ctx.activeRunBySession.set("agent:s1:main", "run-1");

    handleAgentEvent(ctx, {
      sessionKey: "agent:s1:main",
      runId: "run-2",
      stream: "interaction",
      data: {
        phase: "request",
        interactionId: "i-late-start",
        component: "option_list",
        payload: { id: "i-late-start", options: [] },
      },
    });

    expect(ctx.activeRunBySession.get("agent:s1:main")).toBe("run-2");
    expect(useChatStore.getState().interactions["i-late-start"]?.status).toBe(
      "pending",
    );
  });

  it("flips the status + stores response data on response phase", () => {
    const ctx = createCtx();
    useChatStore.getState().upsertInteraction({
      interactionId: "i1",
      component: "question_flow",
      payload: {},
      schemaVersion: 1,
    });

    handleAgentEvent(ctx, {
      sessionKey: "agent:s1:main",
      runId: "run-1",
      stream: "interaction",
      data: {
        phase: "response",
        interactionId: "i1",
        status: "submitted",
        data: { answers: { q: "a" } },
      },
    });

    const entry = useChatStore.getState().interactions.i1;
    expect(entry?.status).toBe("submitted");
    expect(entry?.response).toEqual({ answers: { q: "a" } });
  });

  it("maps cancelled/timed_out status verbatim; other strings coerced to submitted", () => {
    const ctx = createCtx();
    useChatStore.getState().upsertInteraction({
      interactionId: "i1",
      component: "option_list",
      payload: {},
      schemaVersion: 1,
    });
    handleAgentEvent(ctx, {
      sessionKey: "agent:s1:main",
      runId: "run-1",
      stream: "interaction",
      data: {
        phase: "response",
        interactionId: "i1",
        status: "cancelled",
      },
    });
    expect(useChatStore.getState().interactions.i1?.status).toBe("cancelled");

    useChatStore.getState().upsertInteraction({
      interactionId: "i2",
      component: "option_list",
      payload: {},
      schemaVersion: 1,
    });
    handleAgentEvent(ctx, {
      sessionKey: "agent:s1:main",
      runId: "run-1",
      stream: "interaction",
      data: {
        phase: "response",
        interactionId: "i2",
        status: "unknown_weird_status",
      },
    });
    expect(useChatStore.getState().interactions.i2?.status).toBe("submitted");
  });

  it("ignores request events with missing interactionId or component", () => {
    const ctx = createCtx();
    handleAgentEvent(ctx, {
      sessionKey: "agent:s1:main",
      runId: "run-1",
      stream: "interaction",
      data: { phase: "request", component: "question_flow" },
    });
    handleAgentEvent(ctx, {
      sessionKey: "agent:s1:main",
      runId: "run-1",
      stream: "interaction",
      data: { phase: "request", interactionId: "i9" },
    });
    expect(Object.keys(useChatStore.getState().interactions)).toHaveLength(0);
  });
});
