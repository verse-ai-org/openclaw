import { describe, expect, it } from "vitest";
import type { ChannelCatalogEntry, ChannelsStatusSnapshot } from "@/types/channels";
import { isPrimaryChannelId } from "@/components/channels/constants";
import { buildDiscoverLists, resolveChannelOrder } from "./channels-page-helpers";

function catalog(partial: Partial<ChannelCatalogEntry> & { id: string }): ChannelCatalogEntry {
  return {
    label: partial.id,
    detailLabel: partial.id,
    installed: false,
    ...partial,
  };
}

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

describe("resolveChannelOrder", () => {
  it("lists primary channels first then extra runtime ids alphabetically", () => {
    const order = resolveChannelOrder(
      snapshot({
        channelMeta: [
          { id: "zulip", label: "Zulip", detailLabel: "Zulip" },
          { id: "telegram", label: "Telegram", detailLabel: "Telegram" },
          { id: "feishu", label: "Feishu", detailLabel: "Feishu" },
        ],
      }),
    );
    expect(order).toEqual(["feishu", "telegram", "zulip"]);
  });
});

describe("buildDiscoverLists", () => {
  it("puts non-primary discover entries in moreDiscoverEntries", () => {
    const lists = buildDiscoverLists({
      catalog: [
        catalog({ id: "feishu", installed: false }),
        catalog({ id: "zulip", installed: false, npmSpec: "@openclaw/zulip" }),
      ],
      runtimeChannelIds: [],
    });
    expect(lists.enableOnlyEntries.map((entry) => entry.id)).toEqual(["feishu"]);
    expect(lists.moreDiscoverEntries.map((entry) => entry.id)).toEqual(["zulip"]);
    expect(isPrimaryChannelId("feishu")).toBe(true);
    expect(isPrimaryChannelId("zulip")).toBe(false);
  });
});
