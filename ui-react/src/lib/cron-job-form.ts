import type {
  ChannelsStatusSnapshot,
} from "@/types/channels";
import type {
  CronDelivery,
  CronJob,
  CronPayload,
  CronSchedule,
  CronSessionTarget,
  CronWakeMode,
  ScheduledTaskFormData,
} from "@/types/agents";
import { parseCronExprScheduleFields } from "@/lib/cron-schedule-form";

/** Gateway channel sentinel: use last active channel at delivery time. */
export const CRON_CHANNEL_LAST = "last";

export const DEFAULT_SCHEDULED_TASK_FORM: ScheduledTaskFormData = {
  name: "",
  description: "",
  agentId: "",
  enabled: true,
  scheduleKind: "daily",
  preferredTime: "08:00",
  weeklyDayOfWeek: "1",
  monthlyDayOfMonth: "1",
  everyAmount: "1",
  everyUnit: "hours",
  scheduleAt: "",
  deliveryMode: "none",
  deliveryBestEffort: false,
  agentPrompt: "",
  sessionTarget: "isolated",
  wakeMode: "next-heartbeat",
};

function getDefaultChannelId(snapshot: ChannelsStatusSnapshot | null): string | null {
  if (!snapshot) {
    return null;
  }
  for (const channelId of snapshot.channelOrder) {
    const accounts = snapshot.channelAccounts[channelId];
    if (Array.isArray(accounts) && accounts.length > 0) {
      return channelId;
    }
  }
  return null;
}

function normalizePersistedDeliveryChannel(
  value: string | undefined,
  opts: { preserveLast?: boolean } = {},
): string | undefined {
  const channel = value?.trim();
  if (!channel) {
    return undefined;
  }
  if (channel === CRON_CHANNEL_LAST) {
    return opts.preserveLast ? CRON_CHANNEL_LAST : undefined;
  }
  return channel;
}

/** Convert UI form schedule fields to Gateway CronSchedule. */
export function formDataToCronSchedule(form: ScheduledTaskFormData): CronSchedule {
  if (form.scheduleKind === "one-time") {
    let at: string;
    if (form.scheduleAt) {
      const d = new Date(form.scheduleAt);
      if (!Number.isNaN(d.getTime())) {
        at = form.scheduleAt;
      } else {
        at = new Date(Date.now() + 60_000).toISOString();
      }
    } else {
      at = new Date(Date.now() + 60_000).toISOString();
    }
    return { kind: "at", at };
  }
  if (form.scheduleKind === "every") {
    const amount = Math.max(1, Number.parseInt(form.everyAmount, 10) || 1);
    const unit = form.everyUnit;
    const mult = unit === "minutes" ? 60_000 : unit === "hours" ? 3_600_000 : 86_400_000;
    return { kind: "every", everyMs: amount * mult };
  }
  const [h, m] = form.preferredTime.split(":").map(Number);
  const hh = Number.isNaN(h) ? 8 : h;
  const mm = Number.isNaN(m) ? 0 : m;
  switch (form.scheduleKind) {
    case "daily":
      return { kind: "cron", expr: `${mm} ${hh} * * *` };
    case "weekly": {
      const dow = form.weeklyDayOfWeek?.trim() || "1";
      return { kind: "cron", expr: `${mm} ${hh} * * ${dow}` };
    }
    case "monthly": {
      const dom = form.monthlyDayOfMonth?.trim() || "1";
      return { kind: "cron", expr: `${mm} ${hh} ${dom} * *` };
    }
    default:
      return { kind: "cron", expr: `${mm} ${hh} * * *` };
  }
}

export function formDataToCronPayload(form: ScheduledTaskFormData): CronPayload {
  return { kind: "agentTurn", message: form.agentPrompt };
}

export function buildDeliveryFromForm(
  form: ScheduledTaskFormData,
  channelsSnapshot: ChannelsStatusSnapshot | null,
  opts: { preserveLastChannel?: boolean } = {},
): CronDelivery {
  if (form.deliveryMode === "none") {
    return { mode: "none" };
  }
  if (form.deliveryMode === "webhook") {
    return {
      mode: "webhook",
      to: form.deliveryTo?.trim() || undefined,
    };
  }
  const rawChannel = form.deliveryChannel?.trim();
  let channel: string | undefined;
  if (!rawChannel || rawChannel === "__auto__") {
    channel = getDefaultChannelId(channelsSnapshot) ?? undefined;
  } else if (rawChannel === CRON_CHANNEL_LAST) {
    channel = normalizePersistedDeliveryChannel(CRON_CHANNEL_LAST, {
      preserveLast: opts.preserveLastChannel,
    });
  } else {
    channel = rawChannel;
  }
  if (!channel) {
    return { mode: "none" };
  }
  return {
    mode: "announce",
    channel,
    to: form.deliveryTo?.trim() || undefined,
    accountId: form.deliveryAccountId?.trim() || undefined,
    bestEffort: form.deliveryBestEffort,
  };
}

export function cronJobToFormData(
  job: CronJob,
  defaultAgentId: string,
): ScheduledTaskFormData {
  const form: ScheduledTaskFormData = {
    ...DEFAULT_SCHEDULED_TASK_FORM,
    name: job.name,
    description: job.description ?? "",
    agentId: job.agentId ?? defaultAgentId,
    enabled: job.enabled,
    sessionTarget: job.sessionTarget,
    wakeMode: job.wakeMode,
    agentPrompt: job.payload.kind === "agentTurn" ? job.payload.message : "",
  };

  const sched = job.schedule;
  if (sched.kind === "every") {
    const ms = sched.everyMs;
    if (ms % 86_400_000 === 0) {
      form.scheduleKind = "every";
      form.everyAmount = String(ms / 86_400_000);
      form.everyUnit = "days";
    } else if (ms % 3_600_000 === 0) {
      form.scheduleKind = "every";
      form.everyAmount = String(ms / 3_600_000);
      form.everyUnit = "hours";
    } else {
      form.scheduleKind = "every";
      form.everyAmount = String(Math.ceil(ms / 60_000));
      form.everyUnit = "minutes";
    }
  } else if (sched.kind === "cron") {
    const parts = sched.expr.trim().split(/\s+/);
    if (parts.length === 5) {
      const [cronMin, cronHour, cronDay, , cronDow] = parts;
      const hh = String(Number.parseInt(cronHour, 10) || 0).padStart(2, "0");
      const mm = String(Number.parseInt(cronMin, 10) || 0).padStart(2, "0");
      form.preferredTime = `${hh}:${mm}`;
      const scheduleFields = parseCronExprScheduleFields(sched.expr);
      if (cronDow !== "*") {
        form.scheduleKind = "weekly";
        form.weeklyDayOfWeek = scheduleFields.weeklyDayOfWeek ?? cronDow;
      } else if (cronDay !== "*") {
        form.scheduleKind = "monthly";
        form.monthlyDayOfMonth = scheduleFields.monthlyDayOfMonth ?? cronDay;
      } else {
        form.scheduleKind = "daily";
      }
    } else {
      form.scheduleKind = "daily";
    }
  } else {
    form.scheduleKind = "one-time";
    const d = new Date(sched.at);
    if (!Number.isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, "0");
      form.scheduleAt =
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
        `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }

  const delivery = job.delivery;
  if (delivery?.mode === "webhook") {
    form.deliveryMode = "webhook";
    form.deliveryTo = delivery.to ?? "";
  } else if (delivery?.mode === "announce") {
    form.deliveryMode = "announce";
    const ch = delivery.channel?.trim();
    if (ch === CRON_CHANNEL_LAST) {
      form.deliveryChannel = CRON_CHANNEL_LAST;
    } else if (ch) {
      form.deliveryChannel = ch;
    }
    form.deliveryTo = delivery.to ?? "";
    form.deliveryAccountId = delivery.accountId ?? "";
    form.deliveryBestEffort = delivery.bestEffort === true;
  } else {
    form.deliveryMode = "none";
  }

  return form;
}

export function buildCronJobCreateBody(
  form: ScheduledTaskFormData,
  channelsSnapshot: ChannelsStatusSnapshot | null,
): {
  name: string;
  description?: string;
  agentId?: string;
  enabled: boolean;
  deleteAfterRun: boolean;
  schedule: CronSchedule;
  sessionTarget: CronSessionTarget;
  wakeMode: CronWakeMode;
  payload: CronPayload;
  delivery: CronDelivery;
} {
  const description =
    form.description?.trim() || form.agentPrompt.slice(0, 120);
  const agentId = form.agentId.trim() || undefined;
  return {
    name: form.name.trim(),
    description: description || undefined,
    agentId,
    enabled: form.enabled,
    deleteAfterRun: false,
    schedule: formDataToCronSchedule(form),
    sessionTarget: form.sessionTarget,
    wakeMode: form.wakeMode,
    payload: formDataToCronPayload(form),
    delivery: buildDeliveryFromForm(form, channelsSnapshot),
  };
}

export function buildCronJobUpdatePatch(
  form: ScheduledTaskFormData,
  channelsSnapshot: ChannelsStatusSnapshot | null,
  existingJob?: CronJob,
): {
  name: string;
  description?: string;
  agentId?: string;
  enabled: boolean;
  schedule: CronSchedule;
  sessionTarget: CronSessionTarget;
  wakeMode: CronWakeMode;
  payload: CronPayload;
  delivery: CronDelivery;
} {
  const description =
    form.description?.trim() || form.agentPrompt.slice(0, 120);
  const agentId = form.agentId.trim() || undefined;
  return {
    name: form.name.trim(),
    description: description || undefined,
    agentId,
    enabled: form.enabled,
    schedule: formDataToCronSchedule(form),
    sessionTarget: form.sessionTarget,
    wakeMode: form.wakeMode,
    payload: formDataToCronPayload(form),
    delivery: buildDeliveryFromForm(form, channelsSnapshot, {
      preserveLastChannel: existingJob?.delivery?.channel === CRON_CHANNEL_LAST,
    }),
  };
}

export function isWebhookUrlValid(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
