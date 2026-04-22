import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  registerPendingInteraction,
  resetPendingInteractionsForTest,
} from "../../agents/interactions/runner-suspend.js";
import { interactionHandlers } from "./interactions.js";

// Mock heavy infrastructure that is not relevant to handler logic.
vi.mock("../session-utils.js", () => ({
  loadSessionEntry: vi.fn(() => ({ cfg: {}, storePath: undefined, entry: undefined })),
  readSessionMessages: vi.fn(() => []),
}));
vi.mock("../../infra/agent-events.js", () => ({ emitAgentEvent: vi.fn() }));
vi.mock("./chat-run-starter.js", () => ({ startChatRunPipeline: vi.fn() }));

function makeContext() {
  return {
    logGateway: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  } as unknown as Parameters<(typeof interactionHandlers)["chat.interactionRespond"]>[0]["context"];
}

function invoke(params: Record<string, unknown>, respond = vi.fn()) {
  interactionHandlers["chat.interactionRespond"]!({
    req: { type: "req", id: "1", method: "chat.interactionRespond" },
    params,
    client: null,
    isWebchatConnect: () => false,
    respond,
    context: makeContext(),
  });
  return respond;
}

describe("chat.interactionRespond handler", () => {
  beforeEach(() => {
    resetPendingInteractionsForTest();
    vi.clearAllMocks();
  });

  it("rejects when the interactionId has no pending entry", () => {
    const respond = invoke({
      sessionKey: "s1",
      interactionId: "missing",
      data: {},
      status: "submitted",
    });
    expect(respond).toHaveBeenCalledTimes(1);
    const [ok, _payload, error] = respond.mock.calls[0]!;
    expect(ok).toBe(false);
    expect(error?.message).toMatch(/no pending/);
  });

  it("rejects when sessionKey does not match", () => {
    registerPendingInteraction({
      sessionKey: "s-correct",
      runId: "r1",
      interactionId: "iX",
      component: "question_flow",
    });
    const respond = invoke({
      sessionKey: "s-wrong",
      interactionId: "iX",
      data: {},
      status: "submitted",
    });
    const [ok, _p, error] = respond.mock.calls[0]!;
    expect(ok).toBe(false);
    expect(error?.message).toMatch(/sessionKey/);
  });

  it("resolves the first call and reports alreadyResolved on the second", () => {
    registerPendingInteraction({
      sessionKey: "s1",
      runId: "r1",
      interactionId: "iY",
      component: "question_flow",
    });
    const first = invoke({
      sessionKey: "s1",
      interactionId: "iY",
      data: { answer: 1 },
      status: "submitted",
    });
    const [ok1, payload1] = first.mock.calls[0]!;
    expect(ok1).toBe(true);
    expect(payload1).toMatchObject({
      interactionId: "iY",
      status: "submitted",
      alreadyResolved: false,
    });
    const second = invoke({
      sessionKey: "s1",
      interactionId: "iY",
      data: { answer: 2 }, // ignored by the idempotent layer
      status: "submitted",
    });
    const [ok2, payload2] = second.mock.calls[0]!;
    expect(ok2).toBe(true);
    expect(payload2).toMatchObject({
      interactionId: "iY",
      status: "submitted",
      alreadyResolved: true,
    });
  });

  it("validates required params", () => {
    const respond = invoke({ sessionKey: "s1" });
    const [ok, _p, error] = respond.mock.calls[0]!;
    expect(ok).toBe(false);
    expect(error?.message).toMatch(/invalid/);
  });

  it("starts a continuation chat run on first resolve", async () => {
    const { startChatRunPipeline } = await import("./chat-run-starter.js");

    registerPendingInteraction({
      sessionKey: "agent:travel-planner:abc",
      runId: "r-run",
      interactionId: "travel-intake",
      component: "question_flow",
    });
    invoke({
      sessionKey: "agent:travel-planner:abc",
      interactionId: "travel-intake",
      data: { answers: { destination: ["paris"] } },
      status: "submitted",
    });

    expect(startChatRunPipeline).toHaveBeenCalledTimes(1);
    expect(startChatRunPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        rawSessionKey: "agent:travel-planner:abc",
        sessionId: expect.any(String),
      }),
    );
  });

  it("transcript fallback: succeeds when gateway restarted (no in-memory entry)", async () => {
    const { startChatRunPipeline } = await import("./chat-run-starter.js");
    const { loadSessionEntry, readSessionMessages } = await import("../session-utils.js");

    // Provide a valid sessionId so lookupInteractionFromTranscript can read messages.
    vi.mocked(loadSessionEntry).mockReturnValueOnce({
      cfg: {},
      storePath: undefined,
      entry: { sessionId: "sess-restart" } as never,
    });
    // Simulate transcript having a request row but no response row.
    vi.mocked(readSessionMessages).mockReturnValueOnce([
      {
        role: "interaction_request",
        interactionId: "restarted-intake",
        component: "question_flow",
        runId: "old-run",
        payload: {},
        schemaVersion: 1,
        timestamp: new Date().toISOString(),
      },
    ]);

    // No registerPendingInteraction — simulates gateway restart.
    const respond = invoke({
      sessionKey: "agent:travel-planner:restart",
      interactionId: "restarted-intake",
      data: { answers: {} },
      status: "submitted",
    });

    const [ok, payload] = respond.mock.calls[0]!;
    expect(ok).toBe(true);
    expect(payload).toMatchObject({ interactionId: "restarted-intake", alreadyResolved: false });
    expect(startChatRunPipeline).toHaveBeenCalledTimes(1);
    expect(startChatRunPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ rawSessionKey: "agent:travel-planner:restart" }),
    );
  });

  it("transcript fallback: returns alreadyResolved when response row exists", async () => {
    const { loadSessionEntry, readSessionMessages } = await import("../session-utils.js");

    vi.mocked(loadSessionEntry).mockReturnValueOnce({
      cfg: {},
      storePath: undefined,
      entry: { sessionId: "sess-done" } as never,
    });
    vi.mocked(readSessionMessages).mockReturnValueOnce([
      {
        role: "interaction_request",
        interactionId: "done-intake",
        component: "question_flow",
        payload: {},
        schemaVersion: 1,
        timestamp: new Date().toISOString(),
      },
      {
        role: "interaction_response",
        interactionId: "done-intake",
        component: "question_flow",
        status: "submitted",
        data: {},
        timestamp: new Date().toISOString(),
      },
    ]);

    const respond = invoke({
      sessionKey: "agent:travel-planner:done",
      interactionId: "done-intake",
      data: {},
      status: "submitted",
    });

    const [ok, payload] = respond.mock.calls[0]!;
    expect(ok).toBe(true);
    expect(payload).toMatchObject({ alreadyResolved: true });
  });

  it("does NOT start continuation run on a duplicate (alreadyResolved) call", async () => {
    const { startChatRunPipeline } = await import("./chat-run-starter.js");

    registerPendingInteraction({
      sessionKey: "s2",
      runId: "r2",
      interactionId: "iZ",
      component: "option_list",
    });
    // first call
    invoke({ sessionKey: "s2", interactionId: "iZ", data: {}, status: "submitted" });
    vi.clearAllMocks();
    // second call — alreadyResolved, should NOT trigger another heartbeat
    invoke({ sessionKey: "s2", interactionId: "iZ", data: {}, status: "submitted" });

    expect(startChatRunPipeline).not.toHaveBeenCalled();
  });
});
