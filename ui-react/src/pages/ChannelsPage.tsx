import { useEffect, useState } from "react";
import { RefreshCwIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChannelDetailDialog } from "@/components/channels/ChannelDetailDialog";
import { cn } from "@/lib/utils";
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

// ── helpers ─────────────────────────────────────────────────────────────────

function resolveChannelOrder(snapshot: ChannelsStatusSnapshot): string[] {
  if (snapshot.channelMeta?.length) {
    return snapshot.channelMeta.map((e) => e.id);
  }
  if (snapshot.channelOrder?.length) {
    return snapshot.channelOrder;
  }
  return DEFAULT_CHANNEL_ORDER as unknown as string[];
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ChannelsPage() {
  const isConnected = useGatewayStore((s) => s.status === "connected");
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
  // Catalog entries not yet installed (plugin not present at all)
  const notInstalledEntries = (catalog ?? []).filter(
    (e) => !e.installed && !installedIds.has(e.id),
  );
  // Catalog entries installed but plugin is disabled (need Enable Plugin action)
  const pluginDisabledEntries = (catalog ?? []).filter(
    (e) => e.installed && e.pluginEnabled === false,
  );
  // Discover tab shows both: not-installed + plugin-disabled
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
        <div className="flex flex-col gap-10 px-12 py-12 max-w-4xl mx-auto w-full">
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
            <Button
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={handleRefresh}
              className="mb-1 gap-1.5"
            >
              <RefreshCwIcon
                className={cn("size-3.5", loading && "animate-spin")}
              />
              Refresh
            </Button>
          </div>

          {lastError && <ErrorCallout message={lastError} />}

          {/* Tabs: All / Active / Disabled */}
          <Tabs defaultValue="all">
            <TabsList className="inline-flex h-auto gap-1 rounded-2xl bg-[#F6F6F6] p-1">
              <TabsTrigger
                value="all"
                className="rounded-[14px] px-6 py-2 text-[13px] font-semibold text-muted-foreground transition-all
                data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                All ({activeTabChannels.length + discoverEntries.length})
              </TabsTrigger>
              <TabsTrigger
                value="active"
                className="rounded-[14px] px-6 py-2 text-[13px] font-semibold text-muted-foreground transition-all
                data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                Active ({enabledChannels.length})
                {needsSetupChannels.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                    {needsSetupChannels.length} need setup
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="disabled"
                className="rounded-[14px] px-6 py-2 text-[13px] font-semibold text-muted-foreground transition-all
                data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                Disabled ({disabledChannels.length + discoverEntries.length})
              </TabsTrigger>
            </TabsList>

            {/* All tab: installed channels + discover */}
            <TabsContent value="all" className="mt-6">
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
            </TabsContent>

            {/* Active tab */}
            <TabsContent value="active" className="mt-6">
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
            </TabsContent>

            {/* Disabled tab */}
            <TabsContent value="disabled" className="mt-6">
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
            </TabsContent>
          </Tabs>
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
          if (action.kind === "enable-channel") {
            await enableChannel(action.channelId, true);
            setPendingAction(null);
            setOpenChannelId(action.channelId);
          } else if (action.kind === "disable-channel") {
            await enableChannel(action.channelId, false);
            setPendingAction(null);
          } else if (action.kind === "enable-plugin") {
            const { enablePlugin } = usePluginsStore.getState();
            await enablePlugin(action.pluginId, true);
            setPendingAction(null);
            void fetchCatalog();
          }
        }}
        onCancel={() => setPendingAction(null)}
      />
    </>
  );
}
