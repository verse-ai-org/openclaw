import type { DeliveryChannelOption } from "@/lib/cron-delivery-form";
import { DELIVERY_CHANNEL_AUTO } from "@/lib/cron-delivery-form";
import { resolveChannelLifecycle } from "@/lib/channel-lifecycle";
import { CRON_CHANNEL_LAST } from "@/lib/cron-job-form";
import { resolveChannelOrder } from "@/pages/channels-page-helpers";
import type { ChannelsStatusSnapshot } from "@/types/channels";

const CHANNEL_PRIORITY: Record<string, number> = {
  "openclaw-weixin": 0,
  weixin: 0,
  wechat: 0,
  wx: 0,
  feishu: 1,
  lark: 1,
};

/** Align with Channels page: runtime loaded and ready to deliver (running or configured). */
export function channelEligibleForCronDelivery(
  snapshot: ChannelsStatusSnapshot,
  channelId: string,
): boolean {
  const lifecycle = resolveChannelLifecycle({
    channelId,
    snapshot,
  });
  return lifecycle === "running" || lifecycle === "configured";
}

/** Delivery UI: channels that match Channels page active + deliverable lifecycle. */
export function buildRunningDeliveryChannelOptions(
  snapshot: ChannelsStatusSnapshot | null,
): DeliveryChannelOption[] {
  if (!snapshot) {
    return [];
  }
  return resolveChannelOrder(snapshot)
    .filter((id) => channelEligibleForCronDelivery(snapshot, id))
    .map((id) => ({
      id,
      label:
        snapshot.channelMeta?.find((m) => m.id === id)?.label ??
        snapshot.channelLabels[id] ??
        id,
      systemImage: snapshot.channelSystemImages?.[id],
    }))
    .toSorted((a, b) => {
      const pa = CHANNEL_PRIORITY[a.id] ?? 99;
      const pb = CHANNEL_PRIORITY[b.id] ?? 99;
      if (pa !== pb) {
        return pa - pb;
      }
      return a.label.localeCompare(b.label);
    });
}

/** Map legacy/auto/last/missing values to a configured running channel id. */
export function normalizeDeliveryChannelId(
  channel: string | undefined,
  channelOptions: Array<{ id: string }>,
): string {
  const trimmed = channel?.trim();
  if (
    trimmed &&
    trimmed !== DELIVERY_CHANNEL_AUTO &&
    trimmed !== CRON_CHANNEL_LAST &&
    channelOptions.some((o) => o.id === trimmed)
  ) {
    return trimmed;
  }
  return channelOptions[0]?.id ?? "";
}
