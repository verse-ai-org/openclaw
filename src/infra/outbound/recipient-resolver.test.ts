import { describe, expect, it, vi } from "vitest";
import { LEARNED_IDENTITY_CANONICAL } from "../../config/sessions/identity-links-persist.js";
import { resolveAutoFeishuRecipient, resolveAutoRecipient } from "./recipient-resolver.js";

const mocks = vi.hoisted(() => ({
  loadSessionStore: vi.fn(),
  resolveSessionStoreEntry: vi.fn(),
  resolveStorePath: vi.fn(),
}));

vi.mock("../../config/sessions.js", async () => {
  const actual = await vi.importActual<typeof import("../../config/sessions.js")>(
    "../../config/sessions.js",
  );
  return {
    ...actual,
    loadSessionStore: mocks.loadSessionStore,
    resolveSessionStoreEntry: mocks.resolveSessionStoreEntry,
    resolveStorePath: mocks.resolveStorePath,
  };
});

describe("resolveAutoFeishuRecipient", () => {
  it("prefers identityLinks unique sender match", () => {
    const result = resolveAutoFeishuRecipient({
      cfg: {
        session: {
          identityLinks: {
            leonard: ["web:leo", "feishu:ou_abc"],
          },
        },
      } as never,
      senderCandidates: ["web:leo"],
      agentSessionKey: "agent:main:main",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target).toBe("user:ou_abc");
    }
  });

  it("falls back to session identity hints when identityLinks misses", () => {
    mocks.resolveStorePath.mockReturnValue("/tmp/sessions.json");
    mocks.resolveSessionStoreEntry.mockReturnValue({ existing: undefined });
    mocks.loadSessionStore.mockReturnValue({
      "agent:main:main": {
        sessionId: "s1",
        updatedAt: Date.now(),
        identityHints: {
          recipientsByChannel: { feishu: "user:ou_auto" },
        },
      },
    });

    const result = resolveAutoFeishuRecipient({
      cfg: { session: {} } as never,
      senderCandidates: [],
      agentSessionKey: "agent:main:main",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target).toBe("user:ou_auto");
      expect(result.matchedBy).toBe("session.identityHints");
    }
  });

  it("accepts lark alias via generic resolver", () => {
    const result = resolveAutoRecipient({
      channel: "lark",
      cfg: {
        session: {
          identityLinks: {
            leonard: ["web:leo", "lark:ou_abc"],
          },
        },
      } as never,
      senderCandidates: ["web:leo"],
      agentSessionKey: "agent:main:main",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.channel).toBe("feishu");
      expect(result.target).toBe("user:ou_abc");
    }
  });

  it("resolves weixin target via identityLinks", () => {
    const result = resolveAutoRecipient({
      channel: "weixin",
      cfg: {
        session: {
          identityLinks: {
            leonard: ["web:leo", "weixin:wxid_abc123@im.wechat"],
          },
        },
      } as never,
      senderCandidates: ["web:leo"],
      agentSessionKey: "agent:main:main",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.channel).toBe("openclaw-weixin");
      expect(result.target).toBe("wxid_abc123@im.wechat");
    }
  });

  it("resolves weixin target from unique identityLinks when sender is unknown", () => {
    const result = resolveAutoRecipient({
      channel: "openclaw-weixin",
      cfg: {
        session: {
          identityLinks: {
            [LEARNED_IDENTITY_CANONICAL]: ["openclaw-weixin:wxid_cfg@im.wechat"],
          },
        },
      } as never,
      senderCandidates: [],
      agentSessionKey: "agent:main:web",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target).toBe("wxid_cfg@im.wechat");
      expect(result.matchedBy).toBe("session.identityLinks.unique");
    }
  });

  it("resolves weixin target from session identity hints", () => {
    mocks.resolveStorePath.mockReturnValue("/tmp/sessions.json");
    mocks.resolveSessionStoreEntry.mockReturnValue({ existing: undefined });
    mocks.loadSessionStore.mockReturnValue({
      "agent:main:main": {
        sessionId: "s1",
        updatedAt: Date.now(),
        identityHints: {
          recipientsByChannel: { "openclaw-weixin": "wxid_hint@im.wechat" },
        },
      },
    });
    const result = resolveAutoRecipient({
      channel: "openclaw-weixin",
      cfg: { session: {} } as never,
      senderCandidates: [],
      agentSessionKey: "agent:main:main",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target).toBe("wxid_hint@im.wechat");
      expect(result.channel).toBe("openclaw-weixin");
    }
  });
});
