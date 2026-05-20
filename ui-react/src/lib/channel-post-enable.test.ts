import { describe, expect, it } from "vitest";
import {
  channelActionUsesWeixinQrLogin,
  isWeixinLoginSuccessMessage,
  isWeixinWebLoginProviderReady,
  resolveChannelPostEnableFlow,
} from "@/lib/channel-post-enable";
import type { PluginRecord } from "@/types/plugins";

describe("resolveChannelPostEnableFlow", () => {
  it("routes weixin to QR login after enable", () => {
    expect(resolveChannelPostEnableFlow("openclaw-weixin")).toBe("weixin-qr");
  });

  it("routes other channels to detail setup", () => {
    expect(resolveChannelPostEnableFlow("feishu")).toBe("detail");
    expect(resolveChannelPostEnableFlow("telegram")).toBe("detail");
  });
});

describe("isWeixinWebLoginProviderReady", () => {
  it("requires loaded enabled plugin and installed catalog entry", () => {
    const plugin = {
      id: "openclaw-weixin",
      enabled: true,
      status: "loaded",
    } as PluginRecord;
    expect(
      isWeixinWebLoginProviderReady({
        plugins: [plugin],
        catalog: [{ id: "openclaw-weixin", label: "Weixin", detailLabel: "Weixin", installed: true }],
      }),
    ).toBe(true);
    expect(
      isWeixinWebLoginProviderReady({
        plugins: [{ ...plugin, status: "disabled" }],
        catalog: [{ id: "openclaw-weixin", label: "Weixin", detailLabel: "Weixin", installed: true }],
      }),
    ).toBe(false);
  });
});

describe("isWeixinLoginSuccessMessage", () => {
  it("detects already-linked and confirmed messages", () => {
    expect(isWeixinLoginSuccessMessage("已连接过此 OpenClaw，无需重复连接。")).toBe(true);
    expect(isWeixinLoginSuccessMessage("已将此 OpenClaw 连接到微信。")).toBe(true);
    expect(isWeixinLoginSuccessMessage("scan qr")).toBe(false);
  });
});

describe("channelActionUsesWeixinQrLogin", () => {
  it("detects weixin enable, install, and plugin actions", () => {
    expect(
      channelActionUsesWeixinQrLogin({
        kind: "enable-channel",
        channelId: "openclaw-weixin",
      }),
    ).toBe(true);
    expect(
      channelActionUsesWeixinQrLogin({
        kind: "install-channel",
        channelId: "openclaw-weixin",
      }),
    ).toBe(true);
    expect(
      channelActionUsesWeixinQrLogin({
        kind: "enable-plugin",
        pluginId: "openclaw-weixin",
      }),
    ).toBe(true);
    expect(
      channelActionUsesWeixinQrLogin({
        kind: "enable-channel",
        channelId: "feishu",
      }),
    ).toBe(false);
  });
});
