import { DEFAULT_CHANNEL_ORDER, isPrimaryChannelId } from "@/components/channels/constants";
import {
  catalogEntryNeedsInstall,
  isDiscoverLifecycle,
  isPluginActiveLifecycle,
  resolveChannelLifecycle,
} from "@/lib/channel-lifecycle";
import type { ChannelCatalogEntry, ChannelsStatusSnapshot } from "@/types/channels";

export function resolveChannelOrder(snapshot: ChannelsStatusSnapshot): string[] {
  let ids: string[];
  if (snapshot.channelMeta?.length) {
    ids = snapshot.channelMeta.map((entry) => entry.id);
  } else if (snapshot.channelOrder?.length) {
    ids = snapshot.channelOrder;
  } else {
    ids = [];
  }
  const installedSet = new Set(ids);
  const primary = (DEFAULT_CHANNEL_ORDER as readonly string[]).filter((id) => installedSet.has(id));
  const extra = [...installedSet]
    .filter((id) => !isPrimaryChannelId(id))
    .toSorted((a, b) => a.localeCompare(b));
  return [...primary, ...extra];
}

export function buildDiscoverOrderMap(): Map<string, number> {
  return new Map(
    (DEFAULT_CHANNEL_ORDER as readonly string[]).map((id, index) => [id, index]),
  );
}

export function sortCatalogEntries(entries: ChannelCatalogEntry[]): ChannelCatalogEntry[] {
  const orderMap = buildDiscoverOrderMap();
  return [...entries].toSorted((a, b) => {
    const orderDelta = (orderMap.get(a.id) ?? Infinity) - (orderMap.get(b.id) ?? Infinity);
    if (orderDelta !== 0) {
      return orderDelta;
    }
    return a.label.localeCompare(b.label);
  });
}

export function partitionChannelsByLifecycle(params: {
  channelIds: string[];
  snapshot: ChannelsStatusSnapshot | null;
  catalog: ChannelCatalogEntry[] | null;
}): {
  activeIds: string[];
  needsSetupIds: string[];
  configuredIds: string[];
  disabledIds: string[];
} {
  const activeIds: string[] = [];
  const needsSetupIds: string[] = [];
  const configuredIds: string[] = [];
  const disabledIds: string[] = [];

  for (const channelId of params.channelIds) {
    const lifecycle = resolveChannelLifecycle({
      channelId,
      snapshot: params.snapshot,
      catalogEntry: params.catalog?.find((entry) => entry.id === channelId),
    });
    if (!isPluginActiveLifecycle(lifecycle) && lifecycle !== "channel_disabled") {
      continue;
    }
    if (lifecycle === "channel_disabled") {
      disabledIds.push(channelId);
      continue;
    }
    activeIds.push(channelId);
    if (lifecycle === "needs_setup") {
      needsSetupIds.push(channelId);
    } else if (lifecycle === "configured" || lifecycle === "running" || lifecycle === "error") {
      configuredIds.push(channelId);
    }
  }

  return { activeIds, needsSetupIds, configuredIds, disabledIds };
}

export function buildDiscoverLists(params: {
  catalog: ChannelCatalogEntry[] | null;
  runtimeChannelIds: string[];
}): {
  installRequiredEntries: ChannelCatalogEntry[];
  enableOnlyEntries: ChannelCatalogEntry[];
  notInstalledEntries: ChannelCatalogEntry[];
  pluginDisabledEntries: ChannelCatalogEntry[];
  moreDiscoverEntries: ChannelCatalogEntry[];
  discoverEntries: ChannelCatalogEntry[];
} {
  const installedIds = new Set(params.runtimeChannelIds);
  const catalogEntries = params.catalog ?? [];

  const rawNotInstalled = catalogEntries.filter(
    (entry) =>
      isPrimaryChannelId(entry.id) && !entry.installed && !installedIds.has(entry.id),
  );
  const installRequiredEntries = sortCatalogEntries(
    rawNotInstalled.filter((entry) => catalogEntryNeedsInstall(entry)),
  );
  const enableOnlyEntries = sortCatalogEntries(
    rawNotInstalled.filter((entry) => !catalogEntryNeedsInstall(entry)),
  );
  const notInstalledEntries = [...installRequiredEntries, ...enableOnlyEntries];
  const pluginDisabledEntries = sortCatalogEntries(
    catalogEntries.filter(
      (entry) =>
        isPrimaryChannelId(entry.id) && entry.installed && entry.pluginEnabled === false,
    ),
  );
  const moreDiscoverEntries = sortCatalogEntries(
    catalogEntries.filter(
      (entry) =>
        !isPrimaryChannelId(entry.id) &&
        !installedIds.has(entry.id) &&
        isDiscoverEntry(entry),
    ),
  );

  return {
    installRequiredEntries,
    enableOnlyEntries,
    notInstalledEntries,
    pluginDisabledEntries,
    moreDiscoverEntries,
    discoverEntries: [...pluginDisabledEntries, ...notInstalledEntries, ...moreDiscoverEntries],
  };
}

export function countDiscoverByLifecycle(entries: ChannelCatalogEntry[]): {
  notLoaded: number;
  needsInstall: number;
  pluginDisabled: number;
} {
  let notLoaded = 0;
  let needsInstall = 0;
  let pluginDisabled = 0;
  for (const entry of entries) {
    const lifecycle = resolveChannelLifecycle({
      channelId: entry.id,
      snapshot: null,
      catalogEntry: entry,
    });
    if (lifecycle === "not_loaded") {
      notLoaded += 1;
      if (catalogEntryNeedsInstall(entry)) {
        needsInstall += 1;
      }
    } else if (lifecycle === "plugin_disabled") {
      pluginDisabled += 1;
    }
  }
  return { notLoaded, needsInstall, pluginDisabled };
}

export function isDiscoverEntry(entry: ChannelCatalogEntry): boolean {
  return isDiscoverLifecycle(
    resolveChannelLifecycle({
      channelId: entry.id,
      snapshot: null,
      catalogEntry: entry,
    }),
  );
}
