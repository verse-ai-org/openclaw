import { describe, expect, it, vi } from "vitest";
import type { MsgContext } from "../../auto-reply/templating.js";
import {
  LEARNED_IDENTITY_CANONICAL,
  formatIdentityLinkAlias,
  mergeIdentityLinksFromHints,
  resolveInboundIdentityCanonical,
} from "./identity-links-persist.js";

const mutateConfigFileMock = vi.fn();

vi.mock("../config.js", () => ({
  mutateConfigFile: (...args: unknown[]) => mutateConfigFileMock(...args),
}));

describe("identity-links-persist", () => {
  it("formats feishu and weixin aliases", () => {
    expect(formatIdentityLinkAlias("feishu", "user:ou_abc")).toBe("feishu:ou_abc");
    expect(formatIdentityLinkAlias("openclaw-weixin", "wxid_a@im.wechat")).toBe(
      "openclaw-weixin:wxid_a@im.wechat",
    );
  });

  it("merges learned hints under sender canonical and reserved learned key", () => {
    const merged = mergeIdentityLinksFromHints({
      hints: {
        recipientsByChannel: {
          feishu: "user:ou_sender",
          "openclaw-weixin": "wxid_sender@im.wechat",
        },
      },
      canonical: "ou_sender",
    });
    expect(merged?.ou_sender).toEqual(
      expect.arrayContaining(["feishu:ou_sender", "openclaw-weixin:wxid_sender@im.wechat"]),
    );
    expect(merged?.[LEARNED_IDENTITY_CANONICAL]).toEqual(
      expect.arrayContaining(["feishu:ou_sender", "openclaw-weixin:wxid_sender@im.wechat"]),
    );
  });

  it("returns null when hints produce no aliases", () => {
    expect(
      mergeIdentityLinksFromHints({
        hints: { recipientsByChannel: { telegram: "123" } },
        canonical: "ou_sender",
      }),
    ).toBeNull();
  });

  it("resolves inbound canonical from sender id", () => {
    const ctx = {
      SenderId: "wxid_abc123",
      Provider: "openclaw-weixin",
    } as MsgContext;
    expect(resolveInboundIdentityCanonical(ctx)).toBe("wxid_abc123");
  });
});
