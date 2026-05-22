import { CRON_CHANNEL_LAST, isWebhookUrlValid } from "@/lib/cron-job-form";
import type { ScheduledTaskFormData } from "@/types/agents";

export type DeliveryChannelOption = {
  id: string;
  label: string;
  systemImage?: string;
};

/** UI sentinel: Gateway picks first configured channel at save time. */
export const DELIVERY_CHANNEL_AUTO = "__auto__";

export type TaskDeliverySelection =
  | { kind: "none" }
  | {
      kind: "announce";
      channel: string;
      to?: string;
      accountId?: string;
      bestEffort: boolean;
    }
  | { kind: "webhook"; url: string };

export function deliverySelectionFromFormData(
  form: ScheduledTaskFormData,
): TaskDeliverySelection {
  if (form.deliveryMode === "webhook") {
    return { kind: "webhook", url: form.deliveryTo ?? "" };
  }
  if (form.deliveryMode === "announce") {
    const ch = form.deliveryChannel?.trim();
    const channel =
      ch && ch !== CRON_CHANNEL_LAST && ch !== DELIVERY_CHANNEL_AUTO ? ch : "";
    return {
      kind: "announce",
      channel,
      to: form.deliveryTo?.trim() || undefined,
      accountId: form.deliveryAccountId?.trim() || undefined,
      bestEffort: form.deliveryBestEffort,
    };
  }
  return { kind: "none" };
}

export function applyDeliverySelectionToForm(
  selection: TaskDeliverySelection,
): Pick<
  ScheduledTaskFormData,
  | "deliveryMode"
  | "deliveryChannel"
  | "deliveryTo"
  | "deliveryAccountId"
  | "deliveryBestEffort"
> {
  if (selection.kind === "none") {
    return {
      deliveryMode: "none",
      deliveryChannel: undefined,
      deliveryTo: "",
      deliveryAccountId: "",
      deliveryBestEffort: false,
    };
  }
  if (selection.kind === "webhook") {
    return {
      deliveryMode: "webhook",
      deliveryChannel: undefined,
      deliveryTo: selection.url.trim(),
      deliveryAccountId: "",
      deliveryBestEffort: false,
    };
  }
  return {
    deliveryMode: "announce",
    deliveryChannel: selection.channel.trim() || undefined,
    deliveryTo: selection.to ?? "",
    deliveryAccountId: selection.accountId ?? "",
    deliveryBestEffort: selection.bestEffort,
  };
}

export function describeDeliveryTarget(
  selection: Exclude<TaskDeliverySelection, { kind: "none" }>,
  channelLabelById: Record<string, string>,
): { title: string; subtitle?: string } {
  if (selection.kind === "webhook") {
    const url = selection.url.trim();
    let subtitle = url;
    try {
      subtitle = new URL(url).host || url;
    } catch {
      // keep raw url
    }
    return { title: "Webhook", subtitle };
  }
  const title = channelLabelById[selection.channel] ?? selection.channel;
  const subtitle = selection.to?.trim() || selection.channel;
  return { title, subtitle };
}

export type DeliveryDialogErrors = {
  deliveryTo?: string;
};

const WEIXIN_CHANNEL_IDS = new Set([
  "openclaw-weixin",
  "weixin",
  "wechat",
  "wx",
]);

/** True when the user-selected channel (not session hints) is WeChat. */
export function isWeixinDeliveryChannel(channel: string): boolean {
  return WEIXIN_CHANNEL_IDS.has(channel);
}

export function validateDeliveryDialogDraft(
  draft: Exclude<TaskDeliverySelection, { kind: "none" }>,
  opts: {
    isWeixinChannel: boolean;
    hasRecipientSuggestions: boolean;
  },
): DeliveryDialogErrors {
  const errors: DeliveryDialogErrors = {};
  if (draft.kind === "webhook") {
    if (!isWebhookUrlValid(draft.url)) {
      errors.deliveryTo = "Enter a valid http:// or https:// webhook URL.";
    }
    return errors;
  }
  if (
    opts.isWeixinChannel &&
    !draft.to?.trim() &&
    !opts.hasRecipientSuggestions
  ) {
    errors.deliveryTo = "Recipient / group ID is required for WeChat delivery.";
  }
  return errors;
}
