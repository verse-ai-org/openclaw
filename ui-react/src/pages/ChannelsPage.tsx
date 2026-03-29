import { useEffect, useState } from "react";
import { RefreshCwIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useChannelsStore } from "@/store/channels.store";
import { useGatewayStore } from "@/store/gateway.store";
import { usePluginsStore } from "@/store/plugins.store";
import type { ChannelCatalogEntry, ChannelsStatusSnapshot } from "@/types/channels";
import { ErrorCallout } from "@/components/channels/shared/ErrorCallout";
import { ChannelCard, isChannelEnabled } from "@/components/channels/ChannelCard";
import { CatalogCard } from "@/components/channels/CatalogCard";
import { ChannelDetail } from "@/components/channels/ChannelDetail";
import { ChannelDisableDialog } from "@/components/channels/ChannelDisableDialog";
import { ChannelEnablePluginDialog } from "@/components/channels/ChannelEnablePluginDialog";

// ── helpers ─────────────────────────────────────────────────────────────────

function resolveChannelOrder(snapshot: ChannelsStatusSnapshot): string[] {
  if (snapshot.channelMeta?.length) { return snapshot.channelMeta.map((e) => e.id); }
  if (snapshot.channelOrder?.length) { return snapshot.channelOrder; }
  return ["whatsapp", "telegram", "discord", "googlechat", "slack", "signal", "imessage", "nostr"];
}


// ── Main page ─────────────────────────────────────────────────────────────────

export function ChannelsPage() {
  const isConnected = useGatewayStore((s) => s.status === "connected");
  const { snapshot, loading, lastError, fetchStatus, fetchConfigSchema, fetchConfigForm, fetchCatalog, catalog, catalogLoading, catalogError, enableChannel } = useChannelsStore();
  const [openChannelId, setOpenChannelId] = useState<string | null>(null);
  const [pendingDisableChannelId, setPendingDisableChannelId] = useState<string | null>(null);
  const [pendingEnableEntry, setPendingEnableEntry] = useState<ChannelCatalogEntry | null>(null);

  const fetchPlugins = usePluginsStore((s) => s.fetchPlugins);
  const togglingPluginId = usePluginsStore((s) => s.togglingPluginId);

  useEffect(() => {
    if (!isConnected) { return; }
    void fetchStatus(true);
    void fetchConfigSchema();
    void fetchConfigForm();
    void fetchCatalog();
    void fetchPlugins();
  }, [isConnected, fetchStatus, fetchConfigSchema, fetchConfigForm, fetchCatalog, fetchPlugins]);

  const handleRefresh = () => { void fetchStatus(true); void fetchConfigForm(); void fetchCatalog(); void fetchPlugins(); };

  const handleEnablePlugin = (pluginId: string) => {
    const entry = (catalog ?? []).find((e) => e.pluginId === pluginId);
    setPendingEnableEntry(
      entry ?? { id: pluginId, label: pluginId, detailLabel: "", installed: true, pluginId, pluginEnabled: false },
    );
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
        <Button size="sm" variant="outline" onClick={handleRefresh}>Retry</Button>
      </div>
    );
  }

  const allChannels = snapshot ? resolveChannelOrder(snapshot) : [];
  const installedIds = new Set(allChannels);
  // Build a set of channel ids whose plugin is disabled (from catalog)
  // These belong in the Discover tab, not Active/Disabled.
  const pluginDisabledIds = new Set(
    (catalog ?? []).filter((e) => e.installed && e.pluginEnabled === false).map((e) => e.id),
  );
  // Only channels whose plugin is actually enabled appear in Active/Disabled tabs
  const activeTabChannels = allChannels.filter((id) => !pluginDisabledIds.has(id));
  const enabledChannels = activeTabChannels.filter((id) => isChannelEnabled(snapshot?.channelAccounts[id] ?? []));
  const disabledChannels = activeTabChannels.filter((id) => !isChannelEnabled(snapshot?.channelAccounts[id] ?? []));
  // Split enabled channels: configured (has accounts + configured) vs needs setup
  const configuredChannels = enabledChannels.filter((id) => {
    const accounts = snapshot?.channelAccounts[id] ?? [];
    return accounts.length > 0 && accounts.some((a) => a.configured);
  });
  const needsSetupChannels = enabledChannels.filter((id) => !configuredChannels.includes(id));
  // Catalog entries not yet installed (plugin not present at all)
  const notInstalledEntries = (catalog ?? []).filter((e) => !e.installed && !installedIds.has(e.id));
  // Catalog entries installed but plugin is disabled (need Enable Plugin action)
  const pluginDisabledEntries = (catalog ?? []).filter((e) => e.installed && e.pluginEnabled === false);
  // Discover tab shows both: not-installed + plugin-disabled
  const discoverEntries = [...pluginDisabledEntries, ...notInstalledEntries];

  const renderGrid = (ids: string[]) => (
    ids.length === 0
      ? <p className="text-sm text-muted-foreground">None.</p>
      : <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ids.map((channelId) => {
            const label = snapshot?.channelLabels?.[channelId]
              ?? snapshot?.channelMeta?.find((m) => m.id === channelId)?.label
              ?? channelId;
            const detailLabel = snapshot?.channelDetailLabels?.[channelId];
            const accounts = snapshot?.channelAccounts[channelId] ?? [];
            return (
              <ChannelCard key={channelId} channelId={channelId} label={label}
                detailLabel={detailLabel} accounts={accounts}
                onOpen={() => setOpenChannelId(channelId)}
                onDisable={() => setPendingDisableChannelId(channelId)} />
            );
          })}
        </div>
  );

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-10 px-12 py-12 max-w-[1020px] mx-auto w-full">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-2">
            <h2 className="text-[48px] font-extrabold leading-tight tracking-tight text-foreground">Channels</h2>
            <p className="text-lg font-medium text-muted-foreground">
              Messaging integrations — enable, configure, and connect.
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={loading} onClick={handleRefresh}
            className="mb-1 gap-1.5">
            <RefreshCwIcon className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {lastError && <ErrorCallout message={lastError} />}

        {/* Tabs: All / Active / Disabled */}
        <Tabs defaultValue="all">
          <TabsList className="inline-flex h-auto gap-1 rounded-2xl bg-[#F6F6F6] p-1">
            <TabsTrigger value="all"
              className="rounded-[14px] px-6 py-2 text-[13px] font-semibold text-muted-foreground transition-all
                data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm">
              All ({activeTabChannels.length + discoverEntries.length})
            </TabsTrigger>
            <TabsTrigger value="active"
              className="rounded-[14px] px-6 py-2 text-[13px] font-semibold text-muted-foreground transition-all
                data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm">
              Active ({enabledChannels.length}){needsSetupChannels.length > 0 && <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">{needsSetupChannels.length} need setup</span>}
            </TabsTrigger>
            <TabsTrigger value="disabled"
              className="rounded-[14px] px-6 py-2 text-[13px] font-semibold text-muted-foreground transition-all
                data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm">
              Disabled ({disabledChannels.length + discoverEntries.length})
            </TabsTrigger>
          </TabsList>

          {/* All tab: installed channels + discover */}
          <TabsContent value="all" className="mt-6">
            {activeTabChannels.length > 0 && (
              <div className="flex flex-col gap-3">
                {discoverEntries.length > 0 && (
                  <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-wide">Installed</p>
                )}
                {renderGrid(activeTabChannels)}
              </div>
            )}
            {discoverEntries.length > 0 && (
              <div className="flex flex-col gap-6 mt-6">
                {pluginDisabledEntries.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-wide">Installed — needs enabling</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {pluginDisabledEntries.map((entry) => (
                        <CatalogCard key={entry.id} entry={entry} onEnablePlugin={handleEnablePlugin} enablingPluginId={togglingPluginId} />
                      ))}
                    </div>
                  </div>
                )}
                {notInstalledEntries.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-wide">Not installed</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {notInstalledEntries.map((entry) => (
                        <CatalogCard key={entry.id} entry={entry} onEnablePlugin={handleEnablePlugin} enablingPluginId={togglingPluginId} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {activeTabChannels.length === 0 && discoverEntries.length === 0 && (
              <p className="text-sm text-muted-foreground">No channels available.</p>
            )}
          </TabsContent>

          {/* Active tab */}
          <TabsContent value="active" className="mt-6">
            {enabledChannels.length === 0 && (
              <p className="text-sm text-muted-foreground">No active channels.</p>
            )}
            {configuredChannels.length > 0 && (
              <div className="flex flex-col gap-3">
                {needsSetupChannels.length > 0 && (
                  <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-wide">Configured</p>
                )}
                {renderGrid(configuredChannels)}
              </div>
            )}
            {needsSetupChannels.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 mt-4">
                  <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wide">Needs Setup</p>
                  <span className="text-[11px] text-[#9CA3AF]">— enabled but not yet configured</span>
                </div>
                {renderGrid(needsSetupChannels)}
              </div>
            )}
          </TabsContent>

          {/* Disabled tab */}
          <TabsContent value="disabled" className="mt-6">
            {disabledChannels.length > 0 && (
              <div className="flex flex-col gap-3">
                {discoverEntries.length > 0 && (
                  <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-wide">Disabled</p>
                )}
                {renderGrid(disabledChannels)}
              </div>
            )}
            {discoverEntries.length > 0 && (
              <div className="flex flex-col gap-6 mt-6">
                {catalogLoading && !catalog && (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2Icon className="size-4 animate-spin" /> Loading catalog…
                  </div>
                )}
                {catalogError && <ErrorCallout message={catalogError} />}
                {pluginDisabledEntries.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-wide">Installed — needs enabling</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {pluginDisabledEntries.map((entry) => (
                        <CatalogCard key={entry.id} entry={entry} onEnablePlugin={handleEnablePlugin} enablingPluginId={togglingPluginId} />
                      ))}
                    </div>
                  </div>
                )}
                {notInstalledEntries.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-wide">Not installed</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {notInstalledEntries.map((entry) => (
                        <CatalogCard key={entry.id} entry={entry} onEnablePlugin={handleEnablePlugin} enablingPluginId={togglingPluginId} />
                      ))}
                    </div>
                  </div>
                )}
                {!catalogLoading && !catalogError && discoverEntries.length === 0 && disabledChannels.length === 0 && (
                  <p className="text-sm text-muted-foreground">All available channels are already installed and enabled.</p>
                )}
              </div>
            )}
            {disabledChannels.length === 0 && discoverEntries.length === 0 && (
              <p className="text-sm text-muted-foreground">No disabled channels.</p>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Detail dialog */}
      <Dialog open={openChannelId !== null} onOpenChange={(open) => !open && setOpenChannelId(null)}>
        <DialogContent className="w-[640px] max-w-[90vw] max-h-[80vh] flex flex-col rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {openChannelId
                ? (snapshot?.channelLabels?.[openChannelId]
                    ?? snapshot?.channelMeta?.find((m) => m.id === openChannelId)?.label
                    ?? openChannelId)
                : "Channel"}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 overflow-auto">
            <div className="px-1 pb-4">
              {openChannelId && snapshot && (
                <ChannelDetail
                  channelId={openChannelId}
                  snapshot={snapshot}
                  onSaved={() => { void fetchStatus(true); setOpenChannelId(null); }}
                />
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Disable channel confirmation */}
      <ChannelDisableDialog
        channelId={pendingDisableChannelId}
        snapshot={snapshot}
        onConfirm={(id) => { void enableChannel(id, false); setPendingDisableChannelId(null); }}
        onCancel={() => setPendingDisableChannelId(null)}
      />

      {/* Enable plugin confirmation */}
      <ChannelEnablePluginDialog
        entry={pendingEnableEntry}
        onConfirmed={() => { setPendingEnableEntry(null); void fetchCatalog(); }}
        onCancel={() => setPendingEnableEntry(null)}
      />
    </ScrollArea>
  );
}
