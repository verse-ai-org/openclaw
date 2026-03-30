/** Default channel display order used as a fallback when the gateway snapshot
 * provides no channelMeta or channelOrder. Keep this list in sync with the
 * core built-in channels documented in docs/channels/.
 */
export const DEFAULT_CHANNEL_ORDER = [
  "feishu",
  "openclaw-weixin",
  "whatsapp",
  "telegram",
  "discord",
  "googlechat",
  "slack",
  "signal",
  "imessage",
  "nostr",
] as const;
