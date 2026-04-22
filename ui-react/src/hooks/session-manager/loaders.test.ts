import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "@/store/chat.store";
import {
  loadHistoryFromGateway,
  loadSessionsFromGateway,
  syncSessionRunStatusFromGateway,
} from "./loaders";

vi.mock("./history-normalize", () => ({
  normalizeHistoryMessages: vi.fn((_messages, sessionKey: string) => [
    {
      id: "m1",
      role: "assistant",
      content: "ok",
      ts: 1,
      sessionKey,
    },
  ]),
  projectInteractionsFromHistory: vi.fn(() => ({ interactions: {} })),
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
    sending: false,
    sessionKey: "agent:travel:main",
    pendingHistoryReloadKey: null,
    pendingSessionsReloadSeq: 0,
    lastError: null,
    pendingDraftMessage: null,
    pendingGenerationBySession: {},
  });
}

describe("session-manager/loaders", () => {
  beforeEach(() => {
    resetChatState();
  });

  it("loadSessionsFromGateway falls back to current key on request failure", async () => {
    const setLoading = vi.fn();
    const setSessions = vi.fn();
    const client = {
      connected: true,
      request: vi.fn(async () => {
        throw new Error("boom");
      }),
    };

    await loadSessionsFromGateway({
      client: client as never,
      sessionKey: "agent:travel:main",
      setLoading,
      setSessions,
    });

    expect(setLoading).toHaveBeenNthCalledWith(1, true);
    expect(setSessions).toHaveBeenCalledWith([{ key: "agent:travel:main" }]);
    expect(setLoading).toHaveBeenLastCalledWith(false);
  });

  it("loadHistoryFromGateway applies latest response for current session", async () => {
    const historyRequestSeqRef = { current: 0 };
    const client = {
      connected: true,
      request: vi.fn(async () => ({ messages: [{ role: "assistant", text: "x" }] })),
    };

    await loadHistoryFromGateway({
      client: client as never,
      key: "agent:travel:main",
      historyRequestSeqRef,
    });

    expect(useChatStore.getState().messages.length).toBe(1);
    expect(useChatStore.getState().messagesLoading).toBe(false);
  });

  it("loadHistoryFromGateway applies when active session key is not set yet", async () => {
    useChatStore.getState().setSessionKey(null);
    const historyRequestSeqRef = { current: 0 };
    const client = {
      connected: true,
      request: vi.fn(async () => ({ messages: [{ role: "assistant", text: "x" }] })),
    };

    await loadHistoryFromGateway({
      client: client as never,
      key: "agent:travel:main",
      historyRequestSeqRef,
    });

    expect(useChatStore.getState().messages.length).toBe(1);
    expect(useChatStore.getState().messagesLoading).toBe(false);
  });

  it("loadHistoryFromGateway drops stale response for switched session", async () => {
    const historyRequestSeqRef = { current: 0 };
    const deferred: Array<() => void> = [];
    const client = {
      connected: true,
      request: vi.fn(
        () =>
          new Promise<{ messages?: unknown[] }>((resolve) => {
            deferred.push(() => resolve({ messages: [{ role: "assistant", text: "x" }] }));
          }),
      ),
    };

    const p1 = loadHistoryFromGateway({
      client: client as never,
      key: "agent:travel:main",
      historyRequestSeqRef,
    });
    useChatStore.getState().setSessionKey("agent:travel:other");
    const p2 = loadHistoryFromGateway({
      client: client as never,
      key: "agent:travel:other",
      historyRequestSeqRef,
    });

    deferred[1]();
    await p2;
    deferred[0]();
    await p1;

    expect(useChatStore.getState().messages[0]?.sessionKey).toBe("agent:travel:other");
    expect(useChatStore.getState().messagesLoading).toBe(false);
  });

  it("syncSessionRunStatusFromGateway restores active run id", async () => {
    const client = {
      connected: true,
      request: vi.fn(async () => ({ activeRunId: "run-1", startedAtMs: 1 })),
    };

    await syncSessionRunStatusFromGateway({
      client: client as never,
      sessionKey: "agent:travel:main",
    });

    expect(useChatStore.getState().pendingGenerationBySession["agent:travel:main"]).toEqual({
      runId: "run-1",
    });
  });

  it("syncSessionRunStatusFromGateway clears stale run marker when no active run", async () => {
    useChatStore.getState().markSessionGenerating("agent:travel:main", "run-stale");
    const client = {
      connected: true,
      request: vi.fn(async () => ({ activeRunId: null, startedAtMs: null })),
    };

    await syncSessionRunStatusFromGateway({
      client: client as never,
      sessionKey: "agent:travel:main",
    });

    expect(useChatStore.getState().pendingGenerationBySession["agent:travel:main"]).toBeUndefined();
  });
});
