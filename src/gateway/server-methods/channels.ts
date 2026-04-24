import { buildChannelUiCatalog, listChannelPluginCatalogEntries } from "../../channels/plugins/catalog.js";
import { getActivePluginRegistry } from "../../plugins/runtime.js";
import { resolveChannelDefaultAccountId } from "../../channels/plugins/helpers.js";
import {
  type ChannelId,
  getChannelPlugin,
  listChannelPlugins,
  normalizeChannelId,
} from "../../channels/plugins/index.js";
import { buildChannelAccountSnapshot } from "../../channels/plugins/status.js";
import type { ChannelAccountSnapshot, ChannelPlugin } from "../../channels/plugins/types.js";
import type { OpenClawConfig } from "../../config/config.js";
import { loadConfig, readConfigFileSnapshot, writeConfigFile } from "../../config/config.js";
import { enablePluginInConfig } from "../../plugins/enable.js";
import { setPluginEnabledInConfig as setChannelEnabledInConfig } from "../../plugins/toggle-config.js";
import { getChannelActivity } from "../../infra/channel-activity.js";
import { DEFAULT_ACCOUNT_ID } from "../../routing/session-key.js";
import { defaultRuntime } from "../../runtime.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateChannelsEnableParams,
  validateChannelsCatalogParams,
  validateChannelsLogoutParams,
  validateChannelsStatusParams,
} from "../protocol/index.js";
import { formatForLog } from "../ws-log.js";
import type { GatewayRequestContext, GatewayRequestHandlers } from "./types.js";

type ChannelLogoutPayload = {
  channel: ChannelId;
  accountId: string;
  cleared: boolean;
  [key: string]: unknown;
};

export async function logoutChannelAccount(params: {
  channelId: ChannelId;
  accountId?: string | null;
  cfg: OpenClawConfig;
  context: GatewayRequestContext;
  plugin: ChannelPlugin;
}): Promise<ChannelLogoutPayload> {
  const resolvedAccountId =
    params.accountId?.trim() ||
    params.plugin.config.defaultAccountId?.(params.cfg) ||
    params.plugin.config.listAccountIds(params.cfg)[0] ||
    DEFAULT_ACCOUNT_ID;
  const account = params.plugin.config.resolveAccount(params.cfg, resolvedAccountId);
  await params.context.stopChannel(params.channelId, resolvedAccountId);
  const result = await params.plugin.gateway?.logoutAccount?.({
    cfg: params.cfg,
    accountId: resolvedAccountId,
    account,
    runtime: defaultRuntime,
  });
  if (!result) {
    throw new Error(`Channel ${params.channelId} does not support logout`);
  }
  const cleared = Boolean(result.cleared);
  const loggedOut = typeof result.loggedOut === "boolean" ? result.loggedOut : cleared;
  if (loggedOut) {
    params.context.markChannelLoggedOut(params.channelId, true, resolvedAccountId);
  }
  return {
    channel: params.channelId,
    accountId: resolvedAccountId,
    ...result,
    cleared,
  };
}

export const channelsHandlers: GatewayRequestHandlers = {
  "channels.status": async ({ params, respond, context }) => {
    if (!validateChannelsStatusParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid channels.status params: ${formatValidationErrors(validateChannelsStatusParams.errors)}`,
        ),
      );
      return;
    }
    const probe = (params as { probe?: boolean }).probe === true;
    const timeoutMsRaw = (params as { timeoutMs?: unknown }).timeoutMs;
    const timeoutMs = typeof timeoutMsRaw === "number" ? Math.max(1000, timeoutMsRaw) : 10_000;
    const cfg = loadConfig();
    const runtime = context.getRuntimeSnapshot();
    const plugins = listChannelPlugins();
    const pluginMap = new Map<ChannelId, ChannelPlugin>(
      plugins.map((plugin) => [plugin.id, plugin]),
    );

    const resolveRuntimeSnapshot = (
      channelId: ChannelId,
      accountId: string,
      defaultAccountId: string,
    ): ChannelAccountSnapshot | undefined => {
      const accounts = runtime.channelAccounts[channelId];
      const defaultRuntime = runtime.channels[channelId];
      const raw =
        accounts?.[accountId] ?? (accountId === defaultAccountId ? defaultRuntime : undefined);
      if (!raw) {
        return undefined;
      }
      return raw;
    };

    const isAccountEnabled = (plugin: ChannelPlugin, account: unknown) =>
      plugin.config.isEnabled
        ? plugin.config.isEnabled(account, cfg)
        : !account ||
          typeof account !== "object" ||
          (account as { enabled?: boolean }).enabled !== false;

    const buildChannelAccounts = async (channelId: ChannelId) => {
      const plugin = pluginMap.get(channelId);
      if (!plugin) {
        return {
          accounts: [] as ChannelAccountSnapshot[],
          defaultAccountId: DEFAULT_ACCOUNT_ID,
          defaultAccount: undefined as ChannelAccountSnapshot | undefined,
          resolvedAccounts: {} as Record<string, unknown>,
        };
      }
      const accountIds = plugin.config.listAccountIds(cfg);
      const defaultAccountId = resolveChannelDefaultAccountId({
        plugin,
        cfg,
        accountIds,
      });
      const accounts: ChannelAccountSnapshot[] = [];
      const resolvedAccounts: Record<string, unknown> = {};
      for (const accountId of accountIds) {
        const account = plugin.config.resolveAccount(cfg, accountId);
        const enabled = isAccountEnabled(plugin, account);
        resolvedAccounts[accountId] = account;
        let probeResult: unknown;
        let lastProbeAt: number | null = null;
        if (probe && enabled && plugin.status?.probeAccount) {
          let configured = true;
          if (plugin.config.isConfigured) {
            configured = await plugin.config.isConfigured(account, cfg);
          }
          if (configured) {
            probeResult = await plugin.status.probeAccount({
              account,
              timeoutMs,
              cfg,
            });
            lastProbeAt = Date.now();
          }
        }
        let auditResult: unknown;
        if (probe && enabled && plugin.status?.auditAccount) {
          let configured = true;
          if (plugin.config.isConfigured) {
            configured = await plugin.config.isConfigured(account, cfg);
          }
          if (configured) {
            auditResult = await plugin.status.auditAccount({
              account,
              timeoutMs,
              cfg,
              probe: probeResult,
            });
          }
        }
        const runtimeSnapshot = resolveRuntimeSnapshot(channelId, accountId, defaultAccountId);
        const snapshot = await buildChannelAccountSnapshot({
          plugin,
          cfg,
          accountId,
          runtime: runtimeSnapshot,
          probe: probeResult,
          audit: auditResult,
        });
        if (lastProbeAt) {
          snapshot.lastProbeAt = lastProbeAt;
        }
        const activity = getChannelActivity({
          channel: channelId as never,
          accountId,
        });
        if (snapshot.lastOutboundAt == null) {
          snapshot.lastOutboundAt = activity.outboundAt;
        }
        accounts.push(snapshot);
      }
      const defaultAccount =
        accounts.find((entry) => entry.accountId === defaultAccountId) ?? accounts[0];
      return { accounts, defaultAccountId, defaultAccount, resolvedAccounts };
    };

    const uiCatalog = buildChannelUiCatalog(plugins);
    const payload: Record<string, unknown> = {
      ts: Date.now(),
      channelOrder: uiCatalog.order,
      channelLabels: uiCatalog.labels,
      channelDetailLabels: uiCatalog.detailLabels,
      channelSystemImages: uiCatalog.systemImages,
      channelMeta: uiCatalog.entries,
      channels: {} as Record<string, unknown>,
      channelAccounts: {} as Record<string, unknown>,
      channelDefaultAccountId: {} as Record<string, unknown>,
    };
    const channelsMap = payload.channels as Record<string, unknown>;
    const accountsMap = payload.channelAccounts as Record<string, unknown>;
    const defaultAccountIdMap = payload.channelDefaultAccountId as Record<string, unknown>;
    for (const plugin of plugins) {
      const { accounts, defaultAccountId, defaultAccount, resolvedAccounts } =
        await buildChannelAccounts(plugin.id);
      const fallbackAccount =
        resolvedAccounts[defaultAccountId] ?? plugin.config.resolveAccount(cfg, defaultAccountId);
      const summary = plugin.status?.buildChannelSummary
        ? await plugin.status.buildChannelSummary({
            account: fallbackAccount,
            cfg,
            defaultAccountId,
            snapshot:
              defaultAccount ??
              ({
                accountId: defaultAccountId,
              } as ChannelAccountSnapshot),
          })
        : {
            configured: defaultAccount?.configured ?? false,
          };
      channelsMap[plugin.id] = summary;
      accountsMap[plugin.id] = accounts;
      defaultAccountIdMap[plugin.id] = defaultAccountId;
    }

    respond(true, payload, undefined);
  },
  "channels.logout": async ({ params, respond, context }) => {
    if (!validateChannelsLogoutParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid channels.logout params: ${formatValidationErrors(validateChannelsLogoutParams.errors)}`,
        ),
      );
      return;
    }
    const rawChannel = (params as { channel?: unknown }).channel;
    const channelId = typeof rawChannel === "string" ? normalizeChannelId(rawChannel) : null;
    if (!channelId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid channels.logout channel"),
      );
      return;
    }
    const plugin = getChannelPlugin(channelId);
    if (!plugin?.gateway?.logoutAccount) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `channel ${channelId} does not support logout`),
      );
      return;
    }
    const accountIdRaw = (params as { accountId?: unknown }).accountId;
    const accountId = typeof accountIdRaw === "string" ? accountIdRaw.trim() : undefined;
    const snapshot = await readConfigFileSnapshot();
    if (!snapshot.valid) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "config invalid; fix it before logging out"),
      );
      return;
    }
    try {
      const payload = await logoutChannelAccount({
        channelId,
        accountId,
        cfg: snapshot.config ?? {},
        context,
        plugin,
      });
      respond(true, payload, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  // ── channels.catalog ───────────────────────────────────────────────────────
  "channels.catalog": async ({ params, respond }) => {
    if (!validateChannelsCatalogParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid channels.catalog params: ${formatValidationErrors(validateChannelsCatalogParams.errors)}`,
        ),
      );
      return;
    }
    // Installed channel plugins (registered in the runtime registry)
    const installedPlugins = listChannelPlugins();
    const installedIds = new Set(installedPlugins.map((p) => p.id));

    // Full catalog: includes installable-but-not-yet-installed extensions
    const catalogEntries = listChannelPluginCatalogEntries();

    // Build a merged list: installed first (preserving runtime order), then
    // catalog-only entries that are not yet installed.
    type CatalogEntry = {
      id: string;
      label: string;
      detailLabel: string;
      blurb?: string;
      systemImage?: string;
      docsPath?: string;
      installed: boolean;
      npmSpec?: string;
      order?: number;
      // Plugin-level metadata: allows the UI to distinguish between
      // "channel plugin disabled" and "channel plugin not installed".
      pluginId?: string;
      pluginEnabled?: boolean;
    };

    const result: CatalogEntry[] = [];

    // Look up plugin records to determine enabled state per channel.
    const pluginRegistry = getActivePluginRegistry();
    const pluginRecords = pluginRegistry?.plugins ?? [];

    // console.log(
    //   `[channels.catalog] installedPlugins=${installedPlugins.map((p) => p.id).join(",")} pluginRecords=${pluginRecords.map((p) => `${p.id}(channelIds=[${p.channelIds.join(",")}],enabled=${p.enabled})`).join(" ")}`
    // );

    // 1. Installed channels from runtime registry
    for (const plugin of installedPlugins) {
      const catalogMatch = catalogEntries.find((e) => e.id === plugin.id);
      const detailLabel = plugin.meta.detailLabel ?? plugin.meta.selectionLabel ?? plugin.meta.label;
      // Find the plugin record that registered this channel id.
      const pluginRecord = pluginRecords.find((p) => p.channelIds.includes(plugin.id));
      result.push({
        id: plugin.id,
        label: plugin.meta.label,
        detailLabel,
        blurb: plugin.meta.blurb || undefined,
        systemImage: plugin.meta.systemImage || undefined,
        docsPath: plugin.meta.docsPath || undefined,
        installed: true,
        npmSpec: catalogMatch?.install?.npmSpec || undefined,
        order: plugin.meta.order,
        pluginId: pluginRecord?.id,
        pluginEnabled: pluginRecord?.enabled,
      });
    }

    // 1.5. Plugin-registered but disabled channel plugins
    // These are bundled plugins that are installed but have enabled=false in config.
    // They should appear as installed+disabled in the catalog so the UI can show them
    // in the "Installed — needs enabling" group rather than "Not installed".
    for (const pluginRecord of pluginRecords) {
      if (pluginRecord.enabled) continue; // already handled in loop 1 (or will be)
      for (const channelId of pluginRecord.channelIds) {
        if (installedIds.has(channelId)) continue; // already added
        const catalogMatch = catalogEntries.find((e) => e.id === channelId);
        const label = catalogMatch?.meta.label ?? channelId;
        const detailLabel =
          catalogMatch?.meta.detailLabel ??
          catalogMatch?.meta.selectionLabel ??
          catalogMatch?.meta.label ??
          channelId;
        result.push({
          id: channelId,
          label,
          detailLabel,
          blurb: catalogMatch?.meta.blurb || undefined,
          systemImage: catalogMatch?.meta.systemImage || undefined,
          docsPath: catalogMatch?.meta.docsPath || undefined,
          installed: true,
          npmSpec: catalogMatch?.install?.npmSpec || undefined,
          order: catalogMatch?.meta.order,
          pluginId: pluginRecord.id,
          pluginEnabled: false,
        });
        installedIds.add(channelId);
      }
    }

    // 2. Catalog-only channels (not yet installed)
    for (const entry of catalogEntries) {
      if (installedIds.has(entry.id)) {
        continue; // already included above
      }
      const detailLabel = entry.meta.detailLabel ?? entry.meta.selectionLabel ?? entry.meta.label;
      result.push({
        id: entry.id,
        label: entry.meta.label,
        detailLabel,
        blurb: entry.meta.blurb || undefined,
        systemImage: entry.meta.systemImage || undefined,
        docsPath: entry.meta.docsPath || undefined,
        installed: false,
        npmSpec: entry.install.npmSpec || undefined,
        order: entry.meta.order,
      });
    }

    // Sort: by order field, then alphabetically by label
    result.sort((a, b) => {
      const orderA = a.order ?? 999;
      const orderB = b.order ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.label.localeCompare(b.label);
    });

    respond(true, { channels: result }, undefined);
  },

  // ── channels.enable ────────────────────────────────────────────────────────
  "channels.enable": async ({ params, respond }) => {
    if (!validateChannelsEnableParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid channels.enable params: ${formatValidationErrors(validateChannelsEnableParams.errors)}`,
        ),
      );
      return;
    }
    const { channelId, enabled } = params as { channelId: string; enabled: boolean };
    try {
      const cfg = loadConfig();
      let nextCfg: import("../../config/config.js").OpenClawConfig;
      let actualEnabled: boolean;
      let reason: string | undefined;
      if (enabled) {
        const result = enablePluginInConfig(cfg, channelId);
        nextCfg = result.config;
        actualEnabled = result.enabled;
        reason = result.reason;
      } else {
        nextCfg = setChannelEnabledInConfig(cfg, channelId, false);
        actualEnabled = false;
      }
      await writeConfigFile(nextCfg);
      respond(true, { channelId, enabled: actualEnabled, reason });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },
};
