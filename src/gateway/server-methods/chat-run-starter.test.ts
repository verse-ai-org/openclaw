import { describe, expect, it, vi } from "vitest";
import { startChatRunPipeline } from "./chat-run-starter.js";
import { dispatchInboundMessage } from "../../auto-reply/dispatch.js";

vi.mock("../../auto-reply/dispatch.js", () => ({
  dispatchInboundMessage: vi.fn(async () => ({ queuedFinal: false, counts: {} })),
}));

function makeContext() {
  const chatRuns = new Map<string, { sessionKey: string; clientRunId: string }>();
  return {
    chatAbortControllers: new Map(),
    addChatRun: vi.fn((sessionId: string, entry: { sessionKey: string; clientRunId: string }) => {
      chatRuns.set(`${sessionId}:${entry.clientRunId}`, entry);
    }),
    removeChatRun: vi.fn((sessionId: string, clientRunId: string) => {
      const key = `${sessionId}:${clientRunId}`;
      const found = chatRuns.get(key);
      chatRuns.delete(key);
      return found;
    }),
    logGateway: {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  } as unknown as Parameters<typeof startChatRunPipeline>[0]["context"];
}

describe("startChatRunPipeline", () => {
  it("registers and clears abort controller on success", async () => {
    const context = makeContext();
    const onSuccess = vi.fn();
    startChatRunPipeline({
      context,
      cfg: {} as never,
      runId: "run-1",
      rawSessionKey: "agent:test:main",
      sessionId: "sess-1",
      timeoutMs: 30_000,
      source: "chat.send",
      msgContext: {
        Body: "hello",
        SessionKey: "agent:test:main",
        Provider: "interaction-response",
        CommandAuthorized: true,
      } as never,
      dispatcher: {} as never,
      onSuccess,
    });
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(context.chatAbortControllers.has("run-1")).toBe(false);
    expect(context.addChatRun).toHaveBeenCalledWith("sess-1", {
      sessionKey: "agent:test:main",
      clientRunId: "run-1",
    });
    expect(context.removeChatRun).toHaveBeenCalledWith("sess-1", "run-1", "agent:test:main");
  });

  it("registers tool-event recipient on agent run start", async () => {
    const context = makeContext();
    const register = vi.fn();
    (context as { registerToolEventRecipient?: unknown }).registerToolEventRecipient = register;
    vi.mocked(dispatchInboundMessage).mockImplementationOnce(async (args) => {
      args.replyOptions?.onAgentRunStart?.("agent-run-1");
      return { queuedFinal: false, counts: {} };
    });
    startChatRunPipeline({
      context,
      cfg: {} as never,
      runId: "run-1",
      rawSessionKey: "agent:test:main",
      sessionId: "sess-1",
      timeoutMs: 30_000,
      source: "chat.send",
      msgContext: {
        Body: "hello",
        SessionKey: "agent:test:main",
        Provider: "interaction-response",
        CommandAuthorized: true,
      } as never,
      dispatcher: {} as never,
      toolEventSubscription: {
        client: {
          connId: "conn-1",
          connect: { caps: ["tool-events"] },
        } as never,
        includeExistingSessionRuns: false,
      },
    });
    await vi.waitFor(() => expect(register).toHaveBeenCalledWith("agent-run-1", "conn-1"));
  });

  it("mirrors tool-event recipient to existing session runs when enabled", async () => {
    const context = makeContext();
    const register = vi.fn();
    (context as { registerToolEventRecipient?: unknown }).registerToolEventRecipient = register;
    context.chatAbortControllers.set("run-prev", {
      sessionKey: "agent:test:main",
    } as never);
    vi.mocked(dispatchInboundMessage).mockImplementationOnce(async (args) => {
      args.replyOptions?.onAgentRunStart?.("agent-run-2");
      return { queuedFinal: false, counts: {} };
    });
    startChatRunPipeline({
      context,
      cfg: {} as never,
      runId: "run-2",
      rawSessionKey: "agent:test:main",
      sessionId: "sess-2",
      timeoutMs: 30_000,
      source: "chat.send",
      msgContext: {
        Body: "hello",
        SessionKey: "agent:test:main",
        Provider: "interaction-response",
        CommandAuthorized: true,
      } as never,
      dispatcher: {} as never,
      toolEventSubscription: {
        client: {
          connId: "conn-2",
          connect: { caps: ["tool-events"] },
        } as never,
        includeExistingSessionRuns: true,
      },
    });
    await vi.waitFor(() =>
      expect(register).toHaveBeenCalledWith("run-prev", "conn-2"),
    );
  });
});
