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

  it("does not match chinese scheduled-task creation phrasing", () => {
    const intent = resolveQuickSelfSendIntent(
      "帮我创建一个定时任务，1分钟后发送消息：大家好，到我的飞书",
    );
    expect(intent).toBeNull();
  });

  it("does not match english scheduled-task creation phrasing", () => {
    const intent = resolveQuickSelfSendIntent(
      "create a scheduled task to send hello to my wechat in 1 minute",
    );
    expect(intent).toBeNull();
  });
});
