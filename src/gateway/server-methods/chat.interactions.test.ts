import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const agentCommandFromIngressMock = vi.hoisted(() => vi.fn(async () => ({ ok: true })));

const sessionEntryState = vi.hoisted(() => ({
  storePath: "",
}));

const configState = vi.hoisted(() => ({
  interactionStreamEnabled: false,
}));

vi.mock("../session-utils.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../session-utils.js")>();
  return {
    ...original,
    loadSessionEntry: (sessionKey: string) => ({
      cfg: {},
      storePath: sessionEntryState.storePath,
      entry: {
        sessionId: "sess-1",
      },
      canonicalKey: sessionKey.trim(),
    }),
  };
});

vi.mock("../../commands/agent.js", () => ({
  agentCommandFromIngress: agentCommandFromIngressMock,
}));

vi.mock("../../config/config.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../config/config.js")>();
  return {
    ...original,
    loadConfig: () => ({
      gateway: {
        interactions: {
          stream: {
            enabled: configState.interactionStreamEnabled,
            dualWrite: true,
          },
        },
      },
    }),
  };
});

const { chatHandlers } = await import("./chat.js");

function createContext() {
  return {
    deps: {},
    addChatRun: vi.fn(),
    registerToolEventRecipient: vi.fn(),
    broadcast: vi.fn(),
    logGateway: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  agentCommandFromIngressMock.mockClear();
  configState.interactionStreamEnabled = false;
});

describe("chat interaction handlers", () => {
  it("creates and lists interactions", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-chat-interaction-"));
    sessionEntryState.storePath = path.join(dir, "sessions.json");
    const respond = vi.fn();
    const context = createContext();

    await chatHandlers["chat.interaction.request"]({
      params: {
        sessionKey: "agent:travel:main",
        interactionId: "ix-1",
        kind: "question_flow",
        definition: { id: "flow-1", steps: [{ id: "budget", title: "预算", options: [{ id: "a", label: "A" }] }] },
      },
      respond,
      context: context as never,
      req: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        sessionKey: "agent:travel:main",
        interaction: expect.objectContaining({
          id: "ix-1",
          status: "awaiting_user",
        }),
      }),
    );

    const respondList = vi.fn();
    await chatHandlers["chat.interaction.list"]({
      params: { sessionKey: "agent:travel:main" },
      respond: respondList,
      context: context as never,
      req: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });

    expect(respondList).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        interactions: [
          expect.objectContaining({
            id: "ix-1",
            status: "awaiting_user",
          }),
        ],
      }),
    );
  });

  it("emits interaction event when stream is enabled", async () => {
    configState.interactionStreamEnabled = true;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-chat-interaction-event-"));
    sessionEntryState.storePath = path.join(dir, "sessions.json");
    const respond = vi.fn();
    const context = createContext();

    await chatHandlers["chat.interaction.request"]({
      params: {
        sessionKey: "agent:travel:main",
        interactionId: "ix-event",
        kind: "question_flow",
        definition: { id: "flow-evt", steps: [] },
      },
      respond,
      context: context as never,
      req: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });

    expect(context.broadcast).toHaveBeenCalledWith(
      "interaction",
      expect.objectContaining({
        version: 1,
        phase: "requested",
        interactionId: "ix-event",
        kind: "question_flow",
        status: "awaiting_user",
        source: "chat.interaction.request",
      }),
    );
  });

  it("emits failed interaction event for invalid submit state", async () => {
    configState.interactionStreamEnabled = true;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-chat-interaction-failed-event-"));
    sessionEntryState.storePath = path.join(dir, "sessions.json");
    const context = createContext();

    await chatHandlers["chat.interaction.request"]({
      params: {
        sessionKey: "agent:travel:main",
        interactionId: "ix-failed",
        kind: "option_list",
        definition: { id: "choice", options: [{ id: "a", label: "A" }] },
      },
      respond: vi.fn(),
      context: context as never,
      req: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });

    await chatHandlers["chat.interaction.submit"]({
      params: {
        sessionKey: "agent:travel:main",
        interactionId: "ix-failed",
        payload: {
          version: 1,
          kind: "option_list",
          mode: "selection",
          data: { selected: ["a"] },
          displayText: "A",
        },
      },
      respond: vi.fn(),
      context: context as never,
      req: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });

    const respond = vi.fn();
    await chatHandlers["chat.interaction.submit"]({
      params: {
        sessionKey: "agent:travel:main",
        interactionId: "ix-failed",
        payload: {
          version: 1,
          kind: "option_list",
          mode: "selection",
          data: { selected: ["a"] },
          displayText: "A",
        },
      },
      respond,
      context: context as never,
      req: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "INVALID_REQUEST" }),
    );
    expect(context.broadcast).toHaveBeenCalledWith(
      "interaction",
      expect.objectContaining({
        phase: "failed",
        interactionId: "ix-failed",
        kind: "option_list",
        source: "chat.interaction.submit",
      }),
    );
  });

  it("submits only awaiting interactions", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-chat-interaction-submit-"));
    sessionEntryState.storePath = path.join(dir, "sessions.json");
    const context = createContext();

    await chatHandlers["chat.interaction.request"]({
      params: {
        sessionKey: "agent:travel:main",
        interactionId: "ix-submit",
        kind: "option_list",
        definition: { id: "platform-choice", options: [{ id: "search", label: "搜索" }] },
      },
      respond: vi.fn(),
      context: context as never,
      req: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });

    const submitRespond = vi.fn();
    await chatHandlers["chat.interaction.submit"]({
      params: {
        sessionKey: "agent:travel:main",
        interactionId: "ix-submit",
        payload: {
          version: 1,
          kind: "option_list",
          mode: "selection",
          data: { selected: ["search"] },
          displayText: "搜索",
        },
      },
      respond: submitRespond,
      context: context as never,
      req: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });

    expect(submitRespond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        interaction: expect.objectContaining({
          id: "ix-submit",
          status: "submitted",
          resumeRunId: expect.stringContaining("interaction-resume-ix-submit-"),
          submittedPayload: expect.objectContaining({
            version: 1,
            kind: "option_list",
            data: expect.objectContaining({
              selected: ["search"],
            }),
          }),
        }),
      }),
    );
    expect(agentCommandFromIngressMock).toHaveBeenCalledTimes(1);
    expect(agentCommandFromIngressMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("<interaction_resume>"),
      }),
      expect.anything(),
      expect.anything(),
    );

    const submitAgainRespond = vi.fn();
    await chatHandlers["chat.interaction.submit"]({
      params: {
        sessionKey: "agent:travel:main",
        interactionId: "ix-submit",
        payload: {
          version: 1,
          kind: "option_list",
          mode: "selection",
          data: { selected: ["search"] },
          displayText: "搜索",
        },
      },
      respond: submitAgainRespond,
      context: context as never,
      req: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });

    expect(submitAgainRespond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "INVALID_REQUEST",
      }),
    );

    const consumeRespond = vi.fn();
    await chatHandlers["chat.interaction.consume"]({
      params: {
        sessionKey: "agent:travel:main",
        interactionId: "ix-submit",
      },
      respond: consumeRespond,
      context: context as never,
      req: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });
    expect(consumeRespond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        interaction: expect.objectContaining({
          id: "ix-submit",
          status: "consumed",
        }),
      }),
    );
  });

  it("rejects legacy submit payload format", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-chat-interaction-legacy-submit-"));
    sessionEntryState.storePath = path.join(dir, "sessions.json");
    const context = createContext();

    await chatHandlers["chat.interaction.request"]({
      params: {
        sessionKey: "agent:travel:main",
        interactionId: "ix-legacy",
        kind: "option_list",
        definition: { id: "legacy-choice", options: [{ id: "search", label: "搜索" }] },
      },
      respond: vi.fn(),
      context: context as never,
      req: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });

    const submitRespond = vi.fn();
    await chatHandlers["chat.interaction.submit"]({
      params: {
        sessionKey: "agent:travel:main",
        interactionId: "ix-legacy",
        payload: { selected: ["search"] },
      },
      respond: submitRespond,
      context: context as never,
      req: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });

    expect(submitRespond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "INVALID_REQUEST",
      }),
    );
  });

  it("recovers submitted interaction by triggering another resume run", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-chat-interaction-recover-"));
    sessionEntryState.storePath = path.join(dir, "sessions.json");
    const context = createContext();

    await chatHandlers["chat.interaction.request"]({
      params: {
        sessionKey: "agent:travel:main",
        interactionId: "ix-recover",
        kind: "option_list",
        definition: { id: "route-choice", options: [{ id: "a", label: "A" }] },
      },
      respond: vi.fn(),
      context: context as never,
      req: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });
    await chatHandlers["chat.interaction.submit"]({
      params: {
        sessionKey: "agent:travel:main",
        interactionId: "ix-recover",
        payload: {
          version: 1,
          kind: "option_list",
          mode: "selection",
          data: { selected: ["a"] },
          displayText: "A",
        },
      },
      respond: vi.fn(),
      context: context as never,
      req: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });

    const recoverRespond = vi.fn();
    await chatHandlers["chat.interaction.recover"]({
      params: {
        sessionKey: "agent:travel:main",
        interactionId: "ix-recover",
      },
      respond: recoverRespond,
      context: context as never,
      req: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });

    expect(recoverRespond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        interaction: expect.objectContaining({
          id: "ix-recover",
          status: "submitted",
          resumeAttempts: 2,
        }),
      }),
    );
    expect(agentCommandFromIngressMock).toHaveBeenCalledTimes(2);
  });

  it("recovers stale submitted interactions with attempts cap", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-chat-interaction-recover-stale-"));
    sessionEntryState.storePath = path.join(dir, "sessions.json");
    const context = createContext();

    await chatHandlers["chat.interaction.request"]({
      params: {
        sessionKey: "agent:travel:main",
        interactionId: "ix-stale",
        kind: "option_list",
        definition: { id: "route-choice", options: [{ id: "a", label: "A" }] },
      },
      respond: vi.fn(),
      context: context as never,
      req: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });
    await chatHandlers["chat.interaction.submit"]({
      params: {
        sessionKey: "agent:travel:main",
        interactionId: "ix-stale",
        payload: {
          version: 1,
          kind: "option_list",
          mode: "selection",
          data: { selected: ["a"] },
          displayText: "A",
        },
      },
      respond: vi.fn(),
      context: context as never,
      req: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });

    const recoverRespond = vi.fn();
    await chatHandlers["chat.interaction.recover.stale"]({
      params: {
        sessionKey: "agent:travel:main",
        minStaleMs: 0,
        maxAttempts: 3,
        limit: 5,
      },
      respond: recoverRespond,
      context: context as never,
      req: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });

    expect(recoverRespond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        recovered: [expect.objectContaining({ interactionId: "ix-stale" })],
        skipped: expect.objectContaining({
          maxAttempts: 0,
          tooFresh: 0,
          overLimit: 0,
        }),
      }),
    );
    expect(agentCommandFromIngressMock).toHaveBeenCalledTimes(2);
  });
});
