export type QuickSendIntent = {
  channel: string;
  message: string;
};

type QuickSendIntentAdapter = {
  channel: string;
  aliases: string[];
  detect(text: string): string | null;
};

function looksLikeScheduledTaskIntent(text: string): boolean {
  const normalized = text.toLowerCase();
  const schedulePatterns: RegExp[] = [
    /定时任务|创建任务|创建一个任务|创建一个定时|计划任务|稍后|提醒我|分钟后|小时后|明天|后天|每天|每周|每月/,
    /\bscheduled?\b|\bschedule\b|\bcreate (?:a )?(?:scheduled )?task\b|\bremind me\b|\bin \d+\s*(?:min|mins|minute|minutes|hour|hours)\b|\btomorrow\b|\bevery (?:day|week|month)\b|\blater\b/,
  ];
  return schedulePatterns.some((pattern) => pattern.test(normalized));
}

function extractMessageAfterSendPhrase(text: string): string | null {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }
  const colonMatch = normalized.match(/[：:]\s*([\s\S]+)$/);
  if (colonMatch?.[1]) {
    const candidate = colonMatch[1].trim();
    return candidate ? candidate : null;
  }
  const sendMatch = normalized.match(/发送(?:一条)?(?:消息|信息)\s*([\s\S]+)$/i);
  if (!sendMatch?.[1]) {
    return null;
  }
  const candidate = sendMatch[1].trim();
  return candidate ? candidate : null;
}

const FEISHU_INTENT_ADAPTER: QuickSendIntentAdapter = {
  channel: "feishu",
  aliases: ["feishu", "lark", "飞书"],
  detect(text: string): string | null {
    const lower = text.toLowerCase();
    const hasChannel = this.aliases.some((alias) => lower.includes(alias.toLowerCase()));
    const hasSelf = /我的|my\b/i.test(text);
    const hasSend = /发送|send/i.test(text);
    if (!hasChannel || !hasSelf || !hasSend) {
      return null;
    }
    return extractMessageAfterSendPhrase(text);
  },
};

const WEIXIN_INTENT_ADAPTER: QuickSendIntentAdapter = {
  channel: "openclaw-weixin",
  aliases: ["openclaw-weixin", "weixin", "wechat", "微信", "wx"],
  detect(text: string): string | null {
    const lower = text.toLowerCase();
    const hasChannel = this.aliases.some((alias) => lower.includes(alias.toLowerCase()));
    const hasSelf = /我的|my\b/i.test(text);
    const hasSend = /发送|send/i.test(text);
    if (!hasChannel || !hasSelf || !hasSend) {
      return null;
    }
    return extractMessageAfterSendPhrase(text);
  },
};

const INTENT_ADAPTERS: QuickSendIntentAdapter[] = [FEISHU_INTENT_ADAPTER, WEIXIN_INTENT_ADAPTER];

export function resolveQuickSelfSendIntent(input: string): QuickSendIntent | null {
  const text = input.trim();
  if (!text) {
    return null;
  }
  if (looksLikeScheduledTaskIntent(text)) {
    return null;
  }
  for (const adapter of INTENT_ADAPTERS) {
    const message = adapter.detect(text);
    if (message) {
      return {
        channel: adapter.channel,
        message,
      };
    }
  }
  return null;
}
