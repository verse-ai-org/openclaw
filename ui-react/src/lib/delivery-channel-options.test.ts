import { describe, expect, it } from "vitest";
import type { ChannelsStatusSnapshot } from "@/types/channels";
import {
  buildRunningDeliveryChannelOptions,
  channelEligibleForCronDelivery,
} from "./delivery-channel-options";

function snapshot(partial: Partial<ChannelsStatusSnapshot>): ChannelsStatusSnapshot {
  return {
    ts: Date.now(),
    channelOrder: [],
    channelLabels: {},
    channels: {},
    channelAccounts: {},
    channelDefaultAccountId: {},
    ...partial,
  };
}

describe("buildRunningDeliveryChannelOptions", () => {
  it("includes feishu from channelMeta when configured but not running (webhook)", () => {
    const snap = snapshot({
      channelMeta: [
        { id: "openclaw-weixin", label: "WeChat", detailLabel: "WeChat" },
        { id: "feishu", label: "Feishu", detailLabel: "Feishu" },
      ],
      channelOrder: ["openclaw-weixin"],
      channelLabels: {
        "openclaw-weixin": "WeChat",
        feishu: "Feishu",
      },
      channelAccounts: {
        "openclaw-weixin": [
          { accountId: "default", configured: true, running: true, enabled: true },
        ],
        feishu: [
          { accountId: "default", configured: true, running: false, connected: true, enabled: true },
        ],
      },
    });

    expect(channelEligibleForCronDelivery(snap, "feishu")).toBe(true);
    expect(buildRunningDeliveryChannelOptions(snap).map((o) => o.id)).toEqual([
      "openclaw-weixin",
      "feishu",
    ]);
  });
});
