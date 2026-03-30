/**
 * Channel logo utilities.
 * Provides brand logos for channel cards using public CDN URLs or local assets.
 */

import { MessageSquareIcon } from "lucide-react";
import feishuLogo from "@/assets/feishu.svg";
import wechatLogo from "@/assets/wechat.svg";
import microsoftTeamsLogo from "@/assets/microsoft_teams.svg";
import discordLogo from "@/assets/discord.svg";
import telegramLogo from "@/assets/telegram.svg";
import whatsappLogo from "@/assets/whatsapp.svg";
import googleChatLogo from "@/assets/google_chat.svg";
import slackLogo from "@/assets/slack.svg";
import twitchLogo from "@/assets/twitch.svg";
import lineLogo from "@/assets/line.svg";
import imessageLogo from "@/assets/imessage.svg";

export type ChannelLogoSize = "small" | "medium" | "large";

export const CHANNEL_LOGO_URLS: Record<string, string> = {
  // Messaging platforms
  feishu: feishuLogo,
  "openclaw-weixin": wechatLogo,
  whatsapp: whatsappLogo,
  telegram: telegramLogo,
  discord: discordLogo,
  googlechat: googleChatLogo,
  slack: slackLogo,
  twitch: twitchLogo,
  line: lineLogo,
  imessage: imessageLogo,
  microsoftteams: microsoftTeamsLogo,
} as const;

/**
 * Get the logo URL for a channel ID.
 * Falls back to empty string if not found (use hasLogo() to check first).
 */
export function getChannelLogoUrl(channelId: string): string {
  return CHANNEL_LOGO_URLS[channelId] || "";
}

/**
 * Check if a channel has a custom logo.
 */
export function hasLogo(channelId: string): boolean {
  return channelId in CHANNEL_LOGO_URLS;
}

/**
 * Get the default fallback icon component for channels without logo.
 */
export function getDefaultLogoIcon() {
  return MessageSquareIcon;
}

/**
 * Get inline SVG for a channel logo.
 * Returns empty string if not found.
 */
export function getChannelLogoSvg(
  channelId: string,
  size: ChannelLogoSize = "medium",
): string {
  const url = getChannelLogoUrl(channelId);
  if (!url) {
    return "";
  }

  const sizeMap: Record<ChannelLogoSize, number> = {
    small: 16,
    medium: 24,
    large: 32,
  };

  return `<img src="${url}" alt="${channelId}" width="${sizeMap[size]}" height="${sizeMap[size]}" class="shrink-0" />`;
}
