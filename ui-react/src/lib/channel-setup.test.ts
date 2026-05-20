import { describe, expect, it } from "vitest";
import type { ChannelsStatusSnapshot } from "@/types/channels";
import {
  channelSetupShowsGuide,
  resolveChannelSetupSteps,
  resolveCurrentSetupStepIndex,
} from "./channel-setup";

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

describe("resolveChannelSetupSteps", () => {
  it("returns whatsapp login then credentials steps", () => {
    const steps = resolveChannelSetupSteps({
      channelId: "whatsapp",
      lifecycle: "needs_setup",
      snapshot: snapshot({
        channels: { whatsapp: { linked: false, configured: false } },
        channelAccounts: { whatsapp: [] },
      }),
    });
    expect(steps.map((step) => step.id)).toEqual(["login", "credentials"]);
    expect(steps[0]?.done).toBe(false);
    expect(resolveCurrentSetupStepIndex(steps)).toBe(0);
  });

  it("marks weixin login done when configured", () => {
    const steps = resolveChannelSetupSteps({
      channelId: "openclaw-weixin",
      lifecycle: "needs_setup",
      snapshot: snapshot({
        channels: { "openclaw-weixin": { configured: true } },
        channelMeta: [
          { id: "openclaw-weixin", label: "Weixin", detailLabel: "Weixin" },
        ],
        channelAccounts: { "openclaw-weixin": [{ accountId: "default", enabled: true }] },
      }),
    });
    expect(steps).toHaveLength(1);
    expect(steps[0]?.done).toBe(true);
  });

  it("returns empty steps when lifecycle is running", () => {
    expect(
      resolveChannelSetupSteps({
        channelId: "telegram",
        lifecycle: "running",
        snapshot: snapshot({}),
      }),
    ).toEqual([]);
  });
});

describe("channelSetupShowsGuide", () => {
  it("shows for needs_setup and error only", () => {
    expect(channelSetupShowsGuide("needs_setup")).toBe(true);
    expect(channelSetupShowsGuide("error")).toBe(true);
    expect(channelSetupShowsGuide("running")).toBe(false);
  });
});
