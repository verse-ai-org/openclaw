import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "@/store/chat.store";
import { handleInteractionEvent } from "./interaction-event";

vi.mock("../session-scope", () => ({
  isChatEventForActiveSession: vi.fn(() => true),
}));

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
    interactiveRequestedAckById: {},
    interactiveSubmittedAckById: {},
    interactiveConsumedAckById: {},
    sending: false,
    sessionKey: "agent:travel:main",
    pendingHistoryReloadKey: null,
    pendingSessionsReloadSeq: 0,
    lastError: null,
    pendingDraftMessage: null,
    pendingGenerationBySession: {},
  });
}

describe("handleInteractionEvent", () => {
  beforeEach(() => {
    resetChatState();
  });

  it("upserts interactive block and marks requested ack", () => {
    handleInteractionEvent({
      version: 1,
      phase: "requested",
      sessionKey: "agent:travel:main",
      interactionId: "ix-req",
      kind: "question_flow",
      status: "awaiting_user",
      definition: {
        id: "flow-1",
        steps: [{ id: "budget", title: "预算", options: [{ id: "mid", label: "中档" }] }],
      },
    });

    const st = useChatStore.getState();
    expect(st.interactiveStreamById.get("ix-req")).toBeTruthy();
    expect(st.interactiveRequestedAckById["ix-req"]).toBe(true);
  });

  it("hydrates summary and consumed ack on consumed phase", () => {
    handleInteractionEvent({
      version: 1,
      phase: "consumed",
      sessionKey: "agent:travel:main",
      interactionId: "ix-consumed",
      kind: "option_list",
      status: "consumed",
      payload: {
        version: 1,
        kind: "option_list",
        data: { optionIds: ["a"] },
        summary: [{ question: "预算档位", answer: "中档" }],
      },
    });

    const st = useChatStore.getState();
    expect(st.interactiveSummaryById["ix-consumed"]).toEqual([
      { question: "预算档位", answer: "中档" },
    ]);
    expect(st.interactiveSubmittedAckById["ix-consumed"]).toBe(true);
    expect(st.interactiveConsumedAckById["ix-consumed"]).toBe(true);
  });
});
