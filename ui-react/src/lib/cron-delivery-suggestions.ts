import { CRON_CHANNEL_LAST, isWebhookUrlValid } from "@/lib/cron-job-form";
import type { ChannelRecipientEntry, CronJob } from "@/types/agents";

const CHANNEL_ALIASES: Record<string, string[]> = {
  feishu: ["feishu", "lark"],
  lark: ["feishu", "lark"],
  "openclaw-weixin": ["openclaw-weixin", "weixin", "wechat", "wx"],
  weixin: ["openclaw-weixin", "weixin", "wechat", "wx"],
};

export type DeliveryToSuggestion = {
  value: string;
  source: "session" | "history";
};

function channelAliases(channelId: string): string[] {
  return CHANNEL_ALIASES[channelId] ?? [channelId];
}

function jobChannelMatchesEffective(
  jobChannel: string | undefined,
  effectiveChannel: string,
): boolean {
  if (!jobChannel?.trim()) {
    return true;
  }
  const job = jobChannel.trim();
  if (job === CRON_CHANNEL_LAST) {
    return true;
  }
  const effectiveAliases = channelAliases(effectiveChannel);
  const jobAliases = channelAliases(job);
  return effectiveAliases.some((a) => jobAliases.includes(a));
}

export function filterRecipientsForChannel(
  channelId: string | undefined,
  recipients: ChannelRecipientEntry[] | undefined,
): ChannelRecipientEntry[] {
  if (!channelId || !recipients?.length) {
    return [];
  }
  const aliases = channelAliases(channelId);
  return recipients.filter((r) => aliases.includes(r.channel));
}

function uniqueSuggestions(items: DeliveryToSuggestion[]): DeliveryToSuggestion[] {
  const seen = new Set<string>();
  const out: DeliveryToSuggestion[] = [];
  for (const item of items) {
    const key = item.value.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({ ...item, value: key });
  }
  return out;
}

/** Session hints + historical cron delivery.to (matches old Control UI datalist). */
export function buildAnnounceRecipientSuggestions(params: {
  channelRecipients: ChannelRecipientEntry[];
  cronJobs: CronJob[];
  effectiveChannel: string;
}): DeliveryToSuggestion[] {
  const session = filterRecipientsForChannel(
    params.effectiveChannel,
    params.channelRecipients,
  ).map((r) => ({ value: r.target, source: "session" as const }));

  const history: DeliveryToSuggestion[] = [];
  for (const job of params.cronJobs) {
    const delivery = job.delivery;
    if (delivery?.mode !== "announce") {
      continue;
    }
    const to = delivery.to?.trim();
    if (!to) {
      continue;
    }
    if (!jobChannelMatchesEffective(delivery.channel, params.effectiveChannel)) {
      continue;
    }
    history.push({ value: to, source: "history" });
  }

  return uniqueSuggestions([...session, ...history]);
}

export function buildWebhookUrlSuggestions(cronJobs: CronJob[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const job of cronJobs) {
    const to = job.delivery?.to?.trim();
    if (job.delivery?.mode !== "webhook" || !to || !isWebhookUrlValid(to)) {
      continue;
    }
    if (seen.has(to)) {
      continue;
    }
    seen.add(to);
    out.push(to);
  }
  return out;
}
