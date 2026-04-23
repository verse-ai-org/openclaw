import { useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChannelDetailDialog } from "@/components/channels/ChannelDetailDialog";
import { useChannelsStore } from "@/store/channels.store";
import { useGatewayStore } from "@/store/gateway.store";
import { usePluginsStore } from "@/store/plugins.store";
import type { ChannelsStatusSnapshot } from "@/types/channels";
import { ErrorCallout } from "@/components/channels/shared/ErrorCallout";
import { isChannelEnabled } from "@/components/channels/ChannelCard";
import { ChannelGrid } from "@/components/channels/ChannelGrid";
import { ChannelActionDialog } from "@/components/channels/ChannelActionDialog";
import type { ChannelActionVariant } from "@/components/channels/ChannelActionDialog";
import { DEFAULT_CHANNEL_ORDER } from "@/components/channels/constants";
import { CatalogSection } from "@/components/channels/CatalogSection";
import { SegmentedControl } from "@/components/shared/segmented-control";

// ── helpers ─────────────────────────────────────────────────────────────────

function resolveChannelOrder(snapshot: ChannelsStatusSnapshot): string[] {
  let ids: string[];
  if (snapshot.channelMeta?.length) {
    ids = snapshot.channelMeta.map((e) => e.id);
  } else if (snapshot.channelOrder?.length) {
    ids = snapshot.channelOrder;
  } else {
    ids = [];
  }
  // Only show channels defined in DEFAULT_CHANNEL_ORDER, in that exact order.
  const installedSet = new Set(ids);
  return (DEFAULT_CHANNEL_ORDER as readonly string[]).filter((id) =>
    installedSet.has(id),
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ChannelsPage() {
  const [activeView, setActiveView] = useState<"all" | "active" | "disabled">("all");
  const isConnected = useGatewayStore((s) => s.status === "connected");
  const beginRestart = useGatewayStore((s) => s.beginRestart);
  const endRestart = useGatewayStore((s) => s.endRestart);
  const {
    snapshot,
    loading,
    lastError,
    fetchStatus,
    fetchConfigSchema,
    fetchConfigForm,
    fetchCatalog,
    catalog,
    catalogLoading,
    catalogError,
    enableChannel,
  } = useChannelsStore();
  const [openChannelId, setOpenChannelId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] =
    useState<ChannelActionVariant | null>(null);
  // Channel to open once Gateway reconnects after an enable action
  const [pendingOpenChannel, setPendingOpenChannel] = useState<string | null>(null);

  const fetchPlugins = usePluginsStore((s) => s.fetchPlugins);
  const togglingPluginId = usePluginsStore((s) => s.togglingPluginId);

  useEffect(() => {
    if (!isConnected) {
      return;
    }
    void fetchStatus(true);
    void fetchConfigSchema();
    void fetchConfigForm();
    void fetchCatalog();
    void fetchPlugins();
  }, [
    isConnected,
    fetchStatus,
    fetchConfigSchema,
    fetchConfigForm,
    fetchCatalog,
    fetchPlugins,
  ]);

  // When Gateway reconnects (or is already connected) after a channel/plugin
  // action, refresh data and open any pending channel detail dialog.
  // This fires both when isConnected transitions true→false→true (restart) and
  // when isConnected is already true and pendingOpenChannel is set (no restart).
  useEffect(() => {
    if (!isConnected) { return; }
    if (pendingOpenChannel) {
      setOpenChannelId(pendingOpenChannel);
      setPendingOpenChannel(null);
      void fetchStatus(true);
      void fetchCatalog();
      void fetchPlugins();
    }
  }, [isConnected, pendingOpenChannel, fetchStatus, fetchCatalog, fetchPlugins]);

  // After any intentional restart, refresh all data once reconnected.
  const isRestarting = useGatewayStore((s) => s.restarting);
  useEffect(() => {
    // restarting just cleared (setConnected fired) and we're connected
    if (!isRestarting && isConnected) {
      void fetchCatalog();
      void fetchPlugins();
      void fetchStatus(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRestarting]);

  const handleRefresh = () => {
    void fetchStatus(true);
    void fetchConfigForm();
    void fetchCatalog();
    void fetchPlugins();
  };

  const handleEnablePlugin = (pluginId: string) => {
    const entry = (catalog ?? []).find((e) => e.pluginId === pluginId);
    const label = entry?.label ?? pluginId;
    setPendingAction({ kind: "enable-plugin", pluginId, label });
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <p className="text-sm">Not connected to gateway.</p>
      </div>
    );
  }

  if (loading && !snapshot) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        <span className="text-sm">Loading channels…</span>
      </div>
    );
  }

  if (lastError && !snapshot) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <ErrorCallout message={lastError} />
        <Button size="sm" variant="outline" onClick={handleRefresh}>
          Retry
        </Button>
      </div>
    );
  }

  const allChannels = snapshot ? resolveChannelOrder(snapshot) : [];
  const installedIds = new Set(allChannels);
  // Build a set of channel ids whose plugin is disabled (from catalog).
  // Guard: if catalog hasn't loaded yet, don't filter anything — we'd rather
  // show all channels temporarily than accidentally show plugin-disabled channels
  // in the ChannelGrid where clicking them would open the detail dialog.
  const pluginDisabledIds = catalog
    ? new Set(
        catalog
          .filter((e) => e.installed && e.pluginEnabled === false)
          .map((e) => e.id),
      )
    : new Set<string>();
  // Only channels whose plugin is actually enabled appear in Active/Disabled tabs.
  // When catalog hasn't loaded yet, we don't know which channels have disabled plugins,
  // so we show all channels (pluginDisabledIds will be empty until catalog loads).
  const activeTabChannels = allChannels.filter(
    (id) => !pluginDisabledIds.has(id),
  );
  const enabledChannels = activeTabChannels.filter((id) =>
    isChannelEnabled(snapshot?.channelAccounts[id] ?? []),
  );
  const disabledChannels = activeTabChannels.filter(
    (id) => !isChannelEnabled(snapshot?.channelAccounts[id] ?? []),
  );
  // Split enabled channels: configured (has accounts + configured) vs needs setup
  const configuredChannels = enabledChannels.filter((id) => {
    const accounts = snapshot?.channelAccounts[id] ?? [];
    return accounts?.length > 0 && accounts.some((a) => a.configured);
  });
  const needsSetupChannels = enabledChannels.filter(
    (id) => !configuredChannels.includes(id),
  );
  // Shared order map used to sort both installed-disabled and not-installed entries.
  const _discoverOrderMap = new Map(
    (DEFAULT_CHANNEL_ORDER as readonly string[]).map((id, i) => [id, i]),
  );
  const _allowedIds = new Set(DEFAULT_CHANNEL_ORDER as readonly string[]);
  // Catalog entries not yet installed (plugin not present at all)
  const notInstalledEntries = (catalog ?? [])
    .filter((e) => !e.installed && !installedIds.has(e.id) && _allowedIds.has(e.id))
    .sort(
      (a, b) =>
        (_discoverOrderMap.get(a.id) ?? Infinity) -
        (_discoverOrderMap.get(b.id) ?? Infinity),
    );
  // Catalog entries installed but plugin is disabled (need Enable Plugin action)
  const pluginDisabledEntries = (catalog ?? [])
    .filter((e) => e.installed && e.pluginEnabled === false && _allowedIds.has(e.id))
    .sort(
      (a, b) =>
        (_discoverOrderMap.get(a.id) ?? Infinity) -
        (_discoverOrderMap.get(b.id) ?? Infinity),
    );
  // Discover tab shows both: not-installed + plugin-disabled, sorted by DEFAULT_CHANNEL_ORDER.
  const discoverEntries = [...pluginDisabledEntries, ...notInstalledEntries];

  const handleDisable = (channelId: string) => {
    const label =
      snapshot?.channelLabels?.[channelId] ??
      snapshot?.channelMeta?.find((m) => m.id === channelId)?.label ??
      channelId;
    setPendingAction({ kind: "disable-channel", channelId, label });
  };
  const handleEnable = (channelId: string) => {
    const label =
      snapshot?.channelLabels?.[channelId] ??
      snapshot?.channelMeta?.find((m) => m.id === channelId)?.label ??
      channelId;
    setPendingAction({ kind: "enable-channel", channelId, label });
  };
  const handleOpen = (channelId: string) => setOpenChannelId(channelId);

  return (
    <>
      <ScrollArea className="h-full">
        <div className="flex flex-col gap-10 p-8 max-w-4xl mx-auto w-full">
          {/* Header */}
          <div className="flex items-end justify-between">
            <div className="flex flex-col gap-2">
              <h2 className="text-[48px] font-extrabold leading-tight tracking-tight text-foreground">
                Channels
              </h2>
              <p className="text-lg font-medium text-muted-foreground">
                Messaging integrations — enable, configure, and connect.
              </p>
            </div>
          </div>

          {lastError && <ErrorCallout message={lastError} />}

          {/* View switch: All / Active / Disabled */}
          <div className="flex flex-col gap-6">
            <SegmentedControl
              options={[
                {
                  value: "all",
                  label: `All (${activeTabChannels.length + discoverEntries.length})`,
                },
                {
                  value: "active",
                  label:
                    needsSetupChannels.length > 0
                      ? `Active (${enabledChannels.length}, ${needsSetupChannels.length} need setup)`
                      : `Active (${enabledChannels.length})`,
                },
                {
                  value: "disabled",
                  label: `Disabled (${disabledChannels.length + discoverEntries.length})`,
                },
              ]}
              value={activeView}
              onChange={setActiveView}
              size="sm"
              className="w-fit"
            />

            {/* All view: installed channels + discover */}
            {activeView === "all" && (
              <>
                {catalogLoading && !catalog ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2Icon className="size-4 animate-spin" /> Loading…
                  </div>
                ) : (
                  <>
                    {activeTabChannels.length > 0 && (
                      <div className="flex flex-col gap-3">
                        {discoverEntries.length > 0 && (
                          <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-wide">
                            Installed
                          </p>
                        )}
                        <ChannelGrid
                          channelIds={activeTabChannels}
                          snapshot={snapshot}
                          onOpen={handleOpen}
                          onDisable={handleDisable}
                          onEnable={handleEnable}
                        />
                      </div>
                    )}
                    {discoverEntries.length > 0 && (
                      <div className="mt-6">
                        <CatalogSection
                          pluginDisabledEntries={pluginDisabledEntries}
                          notInstalledEntries={notInstalledEntries}
                          onEnablePlugin={handleEnablePlugin}
                          enablingPluginId={togglingPluginId}
                        />
                      </div>
                    )}
                    {activeTabChannels.length === 0 &&
                      discoverEntries.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No channels available.
                        </p>
                      )}
                  </>
                )}
              </>
            )}

            {/* Active view */}
            {activeView === "active" && (
              <>
                {enabledChannels.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No active channels.
                  </p>
                )}
                {configuredChannels.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {needsSetupChannels.length > 0 && (
                      <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-wide">
                        Configured
                      </p>
                    )}
                    <ChannelGrid
                      channelIds={configuredChannels}
                      snapshot={snapshot}
                      onOpen={handleOpen}
                      onDisable={handleDisable}
                      onEnable={handleEnable}
                    />
                  </div>
                )}
                {needsSetupChannels.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 mt-4">
                      <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wide">
                        Needs Setup
                      </p>
                      <span className="text-[11px] text-[#9CA3AF]">
                        — enabled but not yet configured
                      </span>
                    </div>
                    <ChannelGrid
                      channelIds={needsSetupChannels}
                      snapshot={snapshot}
                      onOpen={handleOpen}
                      onDisable={handleDisable}
                      onEnable={handleEnable}
                    />
                  </div>
                )}
              </>
            )}

            {/* Disabled view */}
            {activeView === "disabled" && (
              <>
                {disabledChannels.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {discoverEntries.length > 0 && (
                      <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-wide">
                        Disabled
                      </p>
                    )}
                    <ChannelGrid
                      channelIds={disabledChannels}
                      snapshot={snapshot}
                      onOpen={handleOpen}
                      onDisable={handleDisable}
                      onEnable={handleEnable}
                    />
                  </div>
                )}
                {discoverEntries.length > 0 && (
                  <div className="mt-6">
                    <CatalogSection
                      pluginDisabledEntries={pluginDisabledEntries}
                      notInstalledEntries={notInstalledEntries}
                      onEnablePlugin={handleEnablePlugin}
                      enablingPluginId={togglingPluginId}
                      catalogLoading={catalogLoading}
                      catalogError={catalogError}
                    />
                  </div>
                )}
                {disabledChannels.length === 0 &&
                  discoverEntries.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No disabled channels.
                    </p>
                  )}
              </>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Detail dialog */}
      <ChannelDetailDialog
        channelId={openChannelId}
        snapshot={snapshot}
        onClose={() => setOpenChannelId(null)}
        onSaved={() => {
          void fetchStatus(true);
          setOpenChannelId(null);
        }}
      />

      {/* Channel action confirmation */}
      <ChannelActionDialog
        action={pendingAction}
        onConfirm={async (action) => {
          setPendingAction(null);
          // Show the global overlay. It will be cleared by setConnected() once
          // the WebSocket reconnects, or immediately below if Gateway didn't restart.
          beginRestart();
          try {
            if (action.kind === "enable-channel") {
              // Remember which channel to open once Gateway is back up.
              setPendingOpenChannel(action.channelId);
              await enableChannel(action.channelId, true);
              // RPC returned — Gateway may restart asynchronously after this.
              // Keep the overlay open; it will clear on the next setConnected().
              // The pendingOpenChannel effect will open the detail dialog then.
            } else if (action.kind === "disable-channel") {
              await enableChannel(action.channelId, false);
              // disable also triggers a Gateway restart; keep overlay open.
              // setConnected() will clear it when WS reconnects.
            } else if (action.kind === "enable-plugin") {
              const { enablePlugin } = usePluginsStore.getState();
              await enablePlugin(action.pluginId, true);
              // Plugin enable triggers a Gateway restart; keep overlay open.
              // setConnected() will clear it when WS reconnects.
            }
          } catch {
            // RPC failed — Gateway restarted and closed the WS before responding.
            // If we are still connected, no restart happened; clear the overlay.
            if (useGatewayStore.getState().status === "connected") {
              endRestart();
            }
          }
        }}
        onCancel={() => setPendingAction(null)}
      />
    </>
  );
}
