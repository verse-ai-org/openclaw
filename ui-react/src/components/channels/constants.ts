/** Preferred display order for channels in the UI.
 *
 * Core built-in channels are listed first (matches server-side CHAT_CHANNEL_ORDER
 * in src/channels/registry.ts), followed by known extension channels.
 * Channels not present in this list will appear at the end in their original
 * relative order as returned by the gateway.
 */
export const DEFAULT_CHANNEL_ORDER = [
  // Core built-in channels (keep in sync with src/channels/registry.ts CHAT_CHANNEL_ORDER)
  "feishu",
  "openclaw-weixin",
  "telegram",
  "whatsapp",
  "discord",
  "googlechat",
  "slack",
  "imessage",
  "line",
] as const;

/** First-class channels shipped with OpenClaw — enable loads plugin; no npm install step in UI. */
export const PRIMARY_CHANNEL_IDS = new Set<string>(DEFAULT_CHANNEL_ORDER);

export function isPrimaryChannelId(channelId: string): boolean {
  return PRIMARY_CHANNEL_IDS.has(channelId);
}
