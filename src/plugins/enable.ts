import { hasMeaningfulChannelConfig } from "../channels/config-presence.js";
import { normalizeChatChannelId } from "../channels/ids.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { setPluginEnabledInConfig } from "./toggle-config.js";

function isConfigRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type PluginEnableResult = {
  config: OpenClawConfig;
  enabled: boolean;
  pluginId: string;
  reason?: string;
};

export function enablePluginInConfig(
  cfg: OpenClawConfig,
  pluginId: string,
  options: { updateChannelConfig?: boolean } = {},
): PluginEnableResult {
  const builtInChannelId = normalizeChatChannelId(pluginId);
  const resolvedId = builtInChannelId ?? pluginId;
  if (cfg.plugins?.enabled === false) {
    return { config: cfg, enabled: false, pluginId: resolvedId, reason: "plugins disabled" };
  }
  if (cfg.plugins?.deny?.includes(pluginId) || cfg.plugins?.deny?.includes(resolvedId)) {
    return { config: cfg, enabled: false, pluginId: resolvedId, reason: "blocked by denylist" };
  }
  const allow = cfg.plugins?.allow;
  if (
    Array.isArray(allow) &&
    allow.length > 0 &&
    !allow.includes(pluginId) &&
    !allow.includes(resolvedId)
  ) {
    return { config: cfg, enabled: false, pluginId: resolvedId, reason: "blocked by allowlist" };
  }
  return {
    config: setPluginEnabledInConfig(cfg, resolvedId, true, options),
    enabled: true,
    pluginId: resolvedId,
  };
}

/**
 * Enable a channel plugin for UI/CLI flows. External channel plugins (for example
 * openclaw-weixin) also need a meaningful `channels.<id>` section or gateway
 * startup will skip loading them.
 */
export function enableChannelInConfig(
  cfg: OpenClawConfig,
  channelId: string,
): PluginEnableResult {
  const result = enablePluginInConfig(cfg, channelId);
  if (!result.enabled) {
    return result;
  }
  const channelKey = normalizeChatChannelId(channelId) ?? channelId;
  const channels = isConfigRecord(result.config.channels) ? { ...result.config.channels } : {};
  const existing = channels[channelKey];
  const record = isConfigRecord(existing) ? { ...existing } : {};
  record.enabled = true;
  if (!hasMeaningfulChannelConfig(record)) {
    const accounts = isConfigRecord(record.accounts) ? record.accounts : {};
    if (Object.keys(accounts).length === 0) {
      record.accounts = { default: {} };
    }
  }
  return {
    ...result,
    config: {
      ...result.config,
      channels: {
        ...channels,
        [channelKey]: record,
      },
    },
  };
}
