import type { ChannelCatalogEntry } from "@/types/channels";
import type { PluginRecord } from "@/types/plugins";

export type ChannelPostEnableFlow = "detail" | "weixin-qr";

export const WEIXIN_CHANNEL_ID = "openclaw-weixin";

export const WEIXIN_WEB_LOGIN_NOT_READY_MESSAGE =
  "Weixin plugin is not loaded on the gateway yet. Wait a few seconds and try again, or check Plugins (openclaw-weixin should show Loaded after a gateway restart).";

/** Weixin QR wait can report binded_redirect as a successful already-linked outcome. */
export function isWeixinLoginSuccessMessage(message: string | null | undefined): boolean {
  const normalized = message?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return false;
  }
  return (
    normalized.includes("已连接过此 openclaw") ||
    normalized.includes("已将此 openclaw 连接到微信") ||
    normalized.includes("already connected to this openclaw")
  );
}

/** Gateway web.login.start works once the Weixin channel plugin is loaded (QR hooks live on the channel). */
export function isWeixinWebLoginProviderReady(params: {
  plugins: PluginRecord[];
  catalog: ChannelCatalogEntry[] | null;
}): boolean {
  const plugin = params.plugins.find((entry) => entry.id === WEIXIN_CHANNEL_ID);
  if (!plugin?.enabled || plugin.status !== "loaded") {
    return false;
  }
  const catalogEntry = params.catalog?.find((entry) => entry.id === WEIXIN_CHANNEL_ID);
  if (catalogEntry && !catalogEntry.installed) {
    return false;
  }
  return true;
}

/** After enable + gateway reconnect, which setup UI should open for this channel. */
export function resolveChannelPostEnableFlow(channelId: string): ChannelPostEnableFlow {
  if (channelId === WEIXIN_CHANNEL_ID) {
    return "weixin-qr";
  }
  return "detail";
}

export function channelActionUsesWeixinQrLogin(action: {
  kind: string;
  channelId?: string;
  pluginId?: string;
}): boolean {
  if (action.kind === "enable-channel" || action.kind === "install-channel") {
    return action.channelId === WEIXIN_CHANNEL_ID;
  }
  if (action.kind === "enable-plugin") {
    return action.pluginId === WEIXIN_CHANNEL_ID;
  }
  return false;
}
