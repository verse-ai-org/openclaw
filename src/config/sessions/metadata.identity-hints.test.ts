import { describe, expect, it } from "vitest";
import type { MsgContext } from "../../auto-reply/templating.js";
import { deriveSessionMetaPatch } from "./metadata.js";

function makeCtx(overrides: Partial<MsgContext>): MsgContext {
  return {
    SessionKey: "agent:main:main",
    Provider: "feishu",
    Surface: "feishu",
    ChatType: "direct",
    SenderId: "ou_sender_1",
    ...overrides,
  };
}

describe("deriveSessionMetaPatch identity hints", () => {
  it("learns a feishu direct recipient target", () => {
    const patch = deriveSessionMetaPatch({
      ctx: makeCtx({}),
      sessionKey: "agent:main:main",
    });
    expect(patch?.identityHints?.recipientsByChannel?.feishu).toBe("user:ou_sender_1");
    expect(patch?.identityHints?.feishuDirectUserId).toBe("ou_sender_1");
  });

  it("ignores non-direct chat types", () => {
    const patch = deriveSessionMetaPatch({
      ctx: makeCtx({ ChatType: "group", SenderId: "ou_group_member" }),
      sessionKey: "agent:main:main",
    });
    expect(patch?.identityHints).toBeUndefined();
  });

  it("learns a weixin direct recipient target", () => {
    const patch = deriveSessionMetaPatch({
      ctx: makeCtx({
        Provider: "openclaw-weixin",
        Surface: "openclaw-weixin",
        OriginatingChannel: "openclaw-weixin",
        SenderId: "wxid_sender_1",
      }),
      sessionKey: "agent:main:main",
    });
    expect(patch?.identityHints?.recipientsByChannel?.["openclaw-weixin"]).toBe(
      "wxid_sender_1@im.wechat",
    );
  });
});
