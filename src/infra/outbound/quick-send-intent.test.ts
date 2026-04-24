import { describe, expect, it } from "vitest";
import { resolveQuickSelfSendIntent } from "./quick-send-intent.js";

describe("resolveQuickSelfSendIntent", () => {
  it("parses chinese self feishu send intent", () => {
    const intent = resolveQuickSelfSendIntent("通过我的飞书发送一条信息：你好");
    expect(intent).toEqual({
      channel: "feishu",
      message: "你好",
    });
  });

  it("parses english self lark send intent", () => {
    const intent = resolveQuickSelfSendIntent("send via my lark: hello");
    expect(intent).toEqual({
      channel: "feishu",
      message: "hello",
    });
  });

  it("does not match when self qualifier is missing", () => {
    const intent = resolveQuickSelfSendIntent("通过飞书发送一条信息：你好");
    expect(intent).toBeNull();
  });

  it("parses chinese self weixin send intent", () => {
    const intent = resolveQuickSelfSendIntent("通过我的微信发送一条信息：你好");
    expect(intent).toEqual({
      channel: "openclaw-weixin",
      message: "你好",
    });
  });
});
