import { beforeEach, describe, expect, it } from "vitest";
import { useChatStore } from "./chat.store";

function resetState() {
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

describe("chat.store commitCurrentText", () => {
  beforeEach(() => {
    resetState();
  });

  it("commits only incremental text when stream is cumulative", () => {
    const st = useChatStore.getState();
    st.setStream("你好");
    st.commitCurrentText();

    useChatStore.getState().setStream("你好，世界");
    useChatStore.getState().commitCurrentText();
    useChatStore.getState().finalizeStream();

    const message = useChatStore.getState().messages.at(-1);
    expect(message?.content).toBe("你好\n，世界");
    expect(message?.contentBlocks?.filter((b) => b.type === "text")).toHaveLength(2);
  });
});
