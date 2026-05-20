import { describe, expect, it } from "vitest";
import type { ChannelCatalogEntry, ChannelsStatusSnapshot } from "@/types/channels";
import {
  catalogEntryNeedsInstall,
  isPluginActiveLifecycle,
  isRuntimeChannelLoaded,
  resolveChannelLifecycle,
} from "./channel-lifecycle";

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

describe("resolveChannelLifecycle", () => {
  it("returns not_loaded when catalog says not installed", () => {
    expect(
      resolveChannelLifecycle({
        channelId: "telegram",
        snapshot: null,
        catalogEntry: catalog({ id: "telegram", installed: false }),
      }),
    ).toBe("not_loaded");
  });

  it("returns plugin_disabled when plugin is off in catalog", () => {
    expect(
      resolveChannelLifecycle({
        channelId: "telegram",
        snapshot: null,
        catalogEntry: catalog({
          id: "telegram",
          installed: true,
          pluginEnabled: false,
        }),
      }),
    ).toBe("plugin_disabled");
  });

  it("returns needs_setup when runtime loaded without configured accounts", () => {
    expect(
      resolveChannelLifecycle({
        channelId: "feishu",
        snapshot: snapshot({
          channelMeta: [{ id: "feishu", label: "Feishu", detailLabel: "Feishu" }],
          channelAccounts: { feishu: [{ accountId: "default", enabled: true }] },
        }),
        catalogEntry: catalog({ id: "feishu", installed: true, pluginEnabled: true }),
      }),
    ).toBe("needs_setup");
  });

  it("returns running when an account is running", () => {
    expect(
      resolveChannelLifecycle({
        channelId: "telegram",
        snapshot: snapshot({
          channelMeta: [{ id: "telegram", label: "Telegram", detailLabel: "Telegram" }],
          channelAccounts: {
            telegram: [{ accountId: "default", enabled: true, configured: true, running: true }],
          },
        }),
      }),
    ).toBe("running");
  });

  it("returns channel_disabled when every account is disabled", () => {
    expect(
      resolveChannelLifecycle({
        channelId: "slack",
        snapshot: snapshot({
          channelMeta: [{ id: "slack", label: "Slack", detailLabel: "Slack" }],
          channelAccounts: {
            slack: [{ accountId: "default", enabled: false }],
          },
        }),
      }),
    ).toBe("channel_disabled");
  });

  it("returns needs_setup when lastError is benign not configured", () => {
    expect(
      resolveChannelLifecycle({
        channelId: "feishu",
        snapshot: snapshot({
          channelMeta: [{ id: "feishu", label: "Feishu", detailLabel: "Feishu" }],
          channelAccounts: {
            feishu: [
              {
                accountId: "default",
                enabled: true,
                configured: false,
                running: false,
                lastError: "not configured",
              },
            ],
          },
        }),
      }),
    ).toBe("needs_setup");
  });

  it("prefers error over running when lastError is set", () => {
    expect(
      resolveChannelLifecycle({
        channelId: "discord",
        snapshot: snapshot({
          channelMeta: [{ id: "discord", label: "Discord", detailLabel: "Discord" }],
          channelAccounts: {
            discord: [
              {
                accountId: "default",
                enabled: true,
                configured: true,
                running: true,
                lastError: "probe failed",
              },
            ],
          },
        }),
      }),
    ).toBe("error");
  });
});

describe("isRuntimeChannelLoaded", () => {
  it("detects channel meta membership", () => {
    expect(
      isRuntimeChannelLoaded(
        snapshot({ channelMeta: [{ id: "whatsapp", label: "WA", detailLabel: "WA" }] }),
        "whatsapp",
      ),
    ).toBe(true);
    expect(isRuntimeChannelLoaded(snapshot({ channelMeta: [] }), "whatsapp")).toBe(false);
  });
});

describe("isPluginActiveLifecycle", () => {
  it("treats needs_setup as active plugin", () => {
    expect(isPluginActiveLifecycle("needs_setup")).toBe(true);
    expect(isPluginActiveLifecycle("not_loaded")).toBe(false);
  });
});

describe("catalogEntryNeedsInstall", () => {
  it("does not require install for primary channels even with npmSpec", () => {
    expect(
      catalogEntryNeedsInstall({
        id: "feishu",
        installed: false,
        npmSpec: "@openclaw/feishu",
      }),
    ).toBe(false);
    expect(
      catalogEntryNeedsInstall({
        id: "openclaw-weixin",
        installed: false,
        npmSpec: "@openclaw/openclaw-weixin",
      }),
    ).toBe(false);
  });

  it("requires npm spec for non-primary catalog-only channels", () => {
    expect(
      catalogEntryNeedsInstall({
        id: "zulip",
        installed: false,
        npmSpec: "@openclaw/zulip",
      }),
    ).toBe(true);
    expect(
      catalogEntryNeedsInstall({ id: "zulip", installed: false }),
    ).toBe(false);
    expect(
      catalogEntryNeedsInstall({
        id: "feishu",
        installed: true,
        npmSpec: "@openclaw/feishu",
      }),
    ).toBe(false);
  });
});
