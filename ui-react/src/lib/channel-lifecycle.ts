import { isPrimaryChannelId } from "@/components/channels/constants";
import type {
  ChannelAccountSnapshot,
  ChannelCatalogEntry,
  ChannelsStatusSnapshot,
} from "@/types/channels";

/** UI lifecycle aligned with plugin registry + channel runtime snapshot. */
export type ChannelLifecycle =
  | "not_loaded"
  | "plugin_disabled"
  | "channel_disabled"
  | "needs_setup"
  | "configured"
  | "running"
  | "error";

export type ChannelLifecycleContext = {
  channelId: string;
  snapshot: ChannelsStatusSnapshot | null;
  catalogEntry?: ChannelCatalogEntry;
};

export const CHANNEL_LIFECYCLE_LABELS: Record<ChannelLifecycle, string> = {
  not_loaded: "Not enabled",
  plugin_disabled: "Plugin disabled",
  channel_disabled: "Disabled",
  needs_setup: "Needs setup",
  configured: "Configured",
  error: "Error",
  running: "Running",
};

export function isRuntimeChannelLoaded(
  snapshot: ChannelsStatusSnapshot | null,
  channelId: string,
): boolean {
  if (!snapshot) {
    return false;
  }
  if (snapshot.channelMeta?.some((entry) => entry.id === channelId)) {
    return true;
  }
  return Boolean(snapshot.channelOrder?.includes(channelId));
}

function listAccounts(
  snapshot: ChannelsStatusSnapshot | null,
  channelId: string,
): ChannelAccountSnapshot[] {
  return snapshot?.channelAccounts[channelId] ?? [];
}

/** Gateway uses lastError for setup hints (e.g. "not configured") — not actionable failures. */
const BENIGN_ACCOUNT_STATUS_ERRORS = new Set([
  "not configured",
  "not linked",
  "disabled",
]);

export function isBenignAccountStatusError(message: string | null | undefined): boolean {
  const normalized = message?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return BENIGN_ACCOUNT_STATUS_ERRORS.has(normalized);
}

function hasActionableAccountError(accounts: ChannelAccountSnapshot[]): boolean {
  return accounts.some((account) => {
    const message = account.lastError?.trim();
    if (!message) {
      return false;
    }
    if (isBenignAccountStatusError(message)) {
      return false;
    }
    return true;
  });
}

function hasRunningAccount(accounts: ChannelAccountSnapshot[]): boolean {
  return accounts.some((account) => account.running === true);
}

function hasConfiguredAccount(accounts: ChannelAccountSnapshot[]): boolean {
  return accounts.some((account) => account.configured === true);
}

function isChannelConfigDisabled(accounts: ChannelAccountSnapshot[]): boolean {
  if (accounts.length === 0) {
    return false;
  }
  return accounts.every((account) => account.enabled === false);
}

export function resolveChannelLifecycle(ctx: ChannelLifecycleContext): ChannelLifecycle {
  const { channelId, snapshot, catalogEntry } = ctx;
  const accounts = listAccounts(snapshot, channelId);
  const runtimeLoaded = isRuntimeChannelLoaded(snapshot, channelId);

  if (catalogEntry) {
    if (!catalogEntry.installed) {
      return "not_loaded";
    }
    if (catalogEntry.pluginEnabled === false) {
      return "plugin_disabled";
    }
  } else if (!runtimeLoaded) {
    return "not_loaded";
  }

  if (!runtimeLoaded) {
    return "not_loaded";
  }

  if (isChannelConfigDisabled(accounts)) {
    return "channel_disabled";
  }

  if (hasActionableAccountError(accounts)) {
    return "error";
  }
  if (hasRunningAccount(accounts)) {
    return "running";
  }
  if (hasConfiguredAccount(accounts)) {
    return "configured";
  }
  return "needs_setup";
}

/** Plugin is on and channel appears in runtime (may still need setup). */
export function isPluginActiveLifecycle(lifecycle: ChannelLifecycle): boolean {
  return (
    lifecycle === "needs_setup" ||
    lifecycle === "configured" ||
    lifecycle === "running" ||
    lifecycle === "error"
  );
}

export function isDiscoverLifecycle(lifecycle: ChannelLifecycle): boolean {
  return lifecycle === "not_loaded" || lifecycle === "plugin_disabled";
}

/**
 * Catalog entry needs an explicit `plugins.install` step (npm/clawhub).
 * Primary channels may list npmSpec for publishing but ship with OpenClaw;
 * when gateway defers plugin load, `installed` is false until Enable — not Install.
 */
export function catalogEntryNeedsInstall(entry: {
  id: string;
  installed: boolean;
  npmSpec?: string;
}): boolean {
  if (entry.installed || isPrimaryChannelId(entry.id)) {
    return false;
  }
  return Boolean(entry.npmSpec?.trim());
}

export function channelNeedsSetup(lifecycle: ChannelLifecycle): boolean {
  return lifecycle === "needs_setup";
}

export function formatActivateFailure(reason: string | undefined, fallback: string): string {
  const trimmed = reason?.trim();
  return trimmed ? trimmed : fallback;
}

export async function waitForChannelRuntimeLoaded(params: {
  channelId: string;
  timeoutMs?: number;
  intervalMs?: number;
  refresh: () => Promise<void>;
  readLoaded: () => boolean;
}): Promise<{ ok: boolean; timedOut: boolean }> {
  const timeoutMs = params.timeoutMs ?? 30_000;
  const intervalMs = params.intervalMs ?? 500;
  const started = Date.now();

  if (params.readLoaded()) {
    return { ok: true, timedOut: false };
  }

  while (Date.now() - started < timeoutMs) {
    await params.refresh();
    if (params.readLoaded()) {
      return { ok: true, timedOut: false };
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return { ok: false, timedOut: true };
}
