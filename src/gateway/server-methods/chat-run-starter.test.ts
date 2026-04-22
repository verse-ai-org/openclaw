import { describe, expect, it, vi } from "vitest";
import { startChatRunPipeline } from "./chat-run-starter.js";

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
});
