import { useEffect, useMemo, useState } from "react";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChannelDetailDialog } from "@/components/channels/ChannelDetailDialog";
import { useChannelsStore } from "@/store/channels.store";
import { useGatewayStore } from "@/store/gateway.store";
import { usePluginsStore } from "@/store/plugins.store";
import { ErrorCallout } from "@/components/channels/shared/ErrorCallout";
import { ChannelGrid } from "@/components/channels/ChannelGrid";
import { ChannelActionDialog } from "@/components/channels/ChannelActionDialog";
import type { ChannelActionVariant } from "@/components/channels/ChannelActionDialog";
import { CatalogSection } from "@/components/channels/CatalogSection";
import { ChannelTabEmptyState } from "@/components/channels/ChannelTabEmptyState";
import { MoreChannelsSection } from "@/components/channels/MoreChannelsSection";
import { SegmentedControl } from "@/components/shared/segmented-control";
import {
  buildDiscoverLists,
  // countDiscoverByLifecycle,
  partitionChannelsByLifecycle,
  resolveChannelOrder,
} from "@/pages/channels-page-helpers";
import {
  channelNeedsSetup,
  resolveChannelLifecycle,
} from "@/lib/channel-lifecycle";
import { resolveChannelPostEnableFlow } from "@/lib/channel-post-enable";
import { WeixinQrLoginDialog } from "@/components/channels/WeixinQrLoginDialog";

/** Expandable long-tail catalog bucket; off by default until we want it in the UI again. */
const SHOW_MORE_CHANNELS_SECTION = false;

export function ChannelsPage() {
  const [activeView, setActiveView] = useState<"all" | "active" | "disabled">("all");
  const isConnected = useGatewayStore((s) => s.status === "connected");
  const beginConfigApply = useGatewayStore((s) => s.beginConfigApply);
  const endRestart = useGatewayStore((s) => s.endRestart);
  const {
    snapshot,
    loading,
    lastError,
    refreshPageData,
    fetchConfigSchema,
    fetchConfigForm,
    fetchCatalog,
    catalog,
    catalogLoading,
    catalogError,
    enableChannel,
    activateChannel,
    togglingChannelId,
    toggleChannelError,
  } = useChannelsStore();
  const [openChannelId, setOpenChannelId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<ChannelActionVariant | null>(null);
  const [pendingPostEnableChannel, setPendingPostEnableChannel] = useState<string | null>(null);
  const [weixinQrOpen, setWeixinQrOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const installPlugin = usePluginsStore((s) => s.installPlugin);
  const togglingPluginId = usePluginsStore((s) => s.togglingPluginId);
  const installingSpec = usePluginsStore((s) => s.installingSpec);
  const installError = usePluginsStore((s) => s.installError);
  const isRestarting = useGatewayStore((s) => s.restarting);

  useEffect(() => {
    if (!isConnected) {
      return;
    }
    void refreshPageData({ plugins: true });
    void fetchConfigSchema();
    void fetchConfigForm();
  }, [isConnected, refreshPageData, fetchConfigSchema, fetchConfigForm]);

  // Open setup UI only after gateway reconnects (enable often triggers SIGUSR1 restart).
  useEffect(() => {
    if (!isConnected || isRestarting || !pendingPostEnableChannel) {
      return;
    }
    const channelId = pendingPostEnableChannel;
    setPendingPostEnableChannel(null);
    if (resolveChannelPostEnableFlow(channelId) === "weixin-qr") {
      const raw = snapshot?.channels[channelId] as { configured?: boolean } | undefined;
      if (raw?.configured) {
        setOpenChannelId(channelId);
        return;
      }
      setWeixinQrOpen(true);
      return;
    }
    setOpenChannelId(channelId);
  }, [isConnected, isRestarting, pendingPostEnableChannel, snapshot]);
  useEffect(() => {
    if (!isRestarting && isConnected) {
      void refreshPageData({ plugins: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRestarting]);

  const runtimeChannelIds = useMemo(
    () => (snapshot ? resolveChannelOrder(snapshot) : []),
    [snapshot],
  );

  const {
    installRequiredEntries,
    enableOnlyEntries,
    pluginDisabledEntries,
    moreDiscoverEntries,
    discoverEntries,
  } = useMemo(
    () =>
      buildDiscoverLists({
        catalog,
        runtimeChannelIds,
      }),
    [catalog, runtimeChannelIds],
  );

  const { activeIds, needsSetupIds, configuredIds, disabledIds } = useMemo(
    () =>
      partitionChannelsByLifecycle({
        channelIds: runtimeChannelIds,
        snapshot,
        catalog,
      }),
    [runtimeChannelIds, snapshot, catalog],
  );

  // const discoverCounts = useMemo(
  //   () => countDiscoverByLifecycle(discoverEntries),
  //   [discoverEntries],
  // );

  const hasRuntimeChannels = runtimeChannelIds.length > 0;
  const tabOptions = useMemo(() => {
    const discoverTotal = discoverEntries.length;
    return [
      {
        value: "all" as const,
        label: `All (${activeIds.length + discoverTotal})`,
      },
      {
        value: "active" as const,
        label:
          needsSetupIds.length > 0
            ? `Active (${activeIds.length}, ${needsSetupIds.length} need setup)`
            : `Active (${activeIds.length})`,
      },
      {
        value: "disabled" as const,
        label: `Disabled (${disabledIds.length + discoverTotal})`,
      },
    ];
  }, [activeIds.length, needsSetupIds.length, disabledIds.length, discoverEntries.length]);

  const mergedError =
    actionError ??
    installError ??
    lastError ??
    catalogError ??
    Object.values(toggleChannelError).find((message) => message.trim()) ??
    null;

  const handleRefresh = () => {
    setActionError(null);
    void refreshPageData({ probe: true, plugins: true });
    void fetchConfigForm();
  };

  const resolveLabel = (channelId: string) =>
    snapshot?.channelLabels?.[channelId] ??
    snapshot?.channelMeta?.find((entry) => entry.id === channelId)?.label ??
    catalog?.find((entry) => entry.id === channelId)?.label ??
    channelId;

  const handleActivate = (channelId: string) => {
    setActionError(null);
    setPendingAction({ kind: "enable-channel", channelId, label: resolveLabel(channelId) });
  };

  const handleEnablePlugin = (pluginId: string) => {
    const entry = catalog?.find((item) => item.pluginId === pluginId);
    const label = entry?.label ?? pluginId;
    setActionError(null);
    setPendingAction({ kind: "enable-plugin", pluginId, label });
  };

  const handleInstall = (channelId: string, npmSpec: string) => {
    setActionError(null);
    setPendingAction({
      kind: "install-channel",
      channelId,
      label: resolveLabel(channelId),
      npmSpec,
    });
  };

  const handleDisable = (channelId: string) => {
    setActionError(null);
    setPendingAction({ kind: "disable-channel", channelId, label: resolveLabel(channelId) });
  };

  const handleOpen = (channelId: string) => {
    if (
      resolveChannelPostEnableFlow(channelId) === "weixin-qr" &&
      snapshot &&
      channelNeedsSetup(
        resolveChannelLifecycle({
          channelId,
          snapshot,
          catalogEntry: catalog?.find((entry) => entry.id === channelId),
        }),
      )
    ) {
      setWeixinQrOpen(true);
      return;
    }
    setOpenChannelId(channelId);
  };

  const resolveChannelIdForPlugin = (pluginId: string) =>
    catalog?.find((entry) => entry.pluginId === pluginId)?.id ?? pluginId;

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <p className="text-sm">Not connected to Server.</p>
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

  return (
    <>
      <ScrollArea className="h-full">
        <div className="flex flex-col gap-10 p-8 max-w-4xl mx-auto w-full">
          <div className="flex items-end justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h2 className="text-[48px] font-extrabold leading-tight tracking-tight text-foreground">
                Channels
              </h2>
              <p className="text-lg font-medium text-muted-foreground">
                Enable a channel, configure it, then connect.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={handleRefresh} className="shrink-0 rounded-full">
              <RefreshCwIcon className="size-3.5 mr-1.5" />
              Refresh
            </Button>
          </div>

          {mergedError && <ErrorCallout message={mergedError} />}

          {/* {!hasRuntimeChannels && discoverEntries.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              No channels are loaded yet. Install or enable a channel below, then configure
              credentials. ({discoverCounts.notLoaded} not enabled
              {discoverCounts.needsInstall > 0
                ? `, ${discoverCounts.needsInstall} need install`
                : ""}
              {discoverCounts.pluginDisabled > 0
                ? `, ${discoverCounts.pluginDisabled} plugin disabled`
                : ""}
              )
            </div>
          )} */}

          <div className="flex flex-col gap-6">
            <SegmentedControl
              options={tabOptions}
              value={hasRuntimeChannels ? activeView : "all"}
              onChange={setActiveView}
              size="sm"
              className="w-fit"
            />

            {(hasRuntimeChannels ? activeView : "all") === "all" && (
              <>
                {catalogLoading && !catalog ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2Icon className="size-4 animate-spin" /> Loading catalog…
                  </div>
                ) : (
                  <>
                    {activeIds.length > 0 && (
                      <div className="flex flex-col gap-3">
                        {discoverEntries.length > 0 && (
                          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                            Installed
                          </p>
                        )}
                        <ChannelGrid
                          channelIds={activeIds}
                          snapshot={snapshot}
                          catalog={catalog}
                          onOpen={handleOpen}
                          onDisable={handleDisable}
                          onEnable={handleActivate}
                        />
                      </div>
                    )}
                    {discoverEntries.length > 0 && (
                      <div className={activeIds.length > 0 ? "mt-6" : undefined}>
                        <CatalogSection
                          pluginDisabledEntries={pluginDisabledEntries}
                          installRequiredEntries={installRequiredEntries}
                          enableOnlyEntries={enableOnlyEntries}
                          onEnablePlugin={handleEnablePlugin}
                          onEnableChannel={handleActivate}
                          onInstall={handleInstall}
                          onOpen={handleOpen}
                          enablingPluginId={togglingPluginId}
                          enablingChannelId={togglingChannelId}
                          installingSpec={installingSpec}
                        />
                        {SHOW_MORE_CHANNELS_SECTION && (
                          <MoreChannelsSection
                            entries={moreDiscoverEntries}
                            onEnablePlugin={handleEnablePlugin}
                            onEnableChannel={handleActivate}
                            onInstall={handleInstall}
                            onOpen={handleOpen}
                            enablingPluginId={togglingPluginId}
                            enablingChannelId={togglingChannelId}
                            installingSpec={installingSpec}
                          />
                        )}
                      </div>
                    )}
                    {activeIds.length === 0 && discoverEntries.length === 0 && (
                      <ChannelTabEmptyState variant="all" onRefresh={handleRefresh} />
                    )}
                  </>
                )}
              </>
            )}

            {hasRuntimeChannels && activeView === "active" && (
              <>
                {activeIds.length === 0 && (
                  <ChannelTabEmptyState
                    variant="active"
                    onShowAll={() => setActiveView("all")}
                    onRefresh={handleRefresh}
                  />
                )}
                {configuredIds.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {needsSetupIds.length > 0 && (
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                        Configured
                      </p>
                    )}
                    <ChannelGrid
                      channelIds={configuredIds}
                      snapshot={snapshot}
                      catalog={catalog}
                      onOpen={handleOpen}
                      onDisable={handleDisable}
                      onEnable={handleActivate}
                    />
                  </div>
                )}
                {needsSetupIds.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 mt-4">
                      <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wide dark:text-amber-400">
                        Needs setup
                      </p>
                      <span className="text-[11px] text-muted-foreground">
                        Plugin enabled — add credentials or login
                      </span>
                    </div>
                    <ChannelGrid
                      channelIds={needsSetupIds}
                      snapshot={snapshot}
                      catalog={catalog}
                      onOpen={handleOpen}
                      onDisable={handleDisable}
                      onEnable={handleActivate}
                    />
                  </div>
                )}
              </>
            )}

            {hasRuntimeChannels && activeView === "disabled" && (
              <>
                {disabledIds.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {discoverEntries.length > 0 && (
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                        Disabled in config
                      </p>
                    )}
                    <ChannelGrid
                      channelIds={disabledIds}
                      snapshot={snapshot}
                      catalog={catalog}
                      onOpen={handleOpen}
                      onDisable={handleDisable}
                      onEnable={handleActivate}
                    />
                  </div>
                )}
                {discoverEntries.length > 0 && (
                  <div className="mt-6">
                    <CatalogSection
                      pluginDisabledEntries={pluginDisabledEntries}
                      installRequiredEntries={installRequiredEntries}
                      enableOnlyEntries={enableOnlyEntries}
                      onEnablePlugin={handleEnablePlugin}
                      onEnableChannel={handleActivate}
                      onInstall={handleInstall}
                      onOpen={handleOpen}
                      enablingPluginId={togglingPluginId}
                      enablingChannelId={togglingChannelId}
                      installingSpec={installingSpec}
                      catalogLoading={catalogLoading}
                      catalogError={catalogError}
                    />
                    {SHOW_MORE_CHANNELS_SECTION && (
                      <MoreChannelsSection
                        entries={moreDiscoverEntries}
                        onEnablePlugin={handleEnablePlugin}
                        onEnableChannel={handleActivate}
                        onInstall={handleInstall}
                        onOpen={handleOpen}
                        enablingPluginId={togglingPluginId}
                        enablingChannelId={togglingChannelId}
                        installingSpec={installingSpec}
                      />
                    )}
                  </div>
                )}
                {disabledIds.length === 0 && discoverEntries.length === 0 && (
                  <ChannelTabEmptyState
                    variant="disabled"
                    onShowAll={() => setActiveView("all")}
                    onRefresh={handleRefresh}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </ScrollArea>

      <ChannelDetailDialog
        channelId={openChannelId}
        snapshot={snapshot}
        catalog={catalog}
        onClose={() => setOpenChannelId(null)}
        onSaved={() => {
          void refreshPageData({ probe: true });
          setOpenChannelId(null);
        }}
      />

      <WeixinQrLoginDialog
        open={weixinQrOpen}
        onClose={() => setWeixinQrOpen(false)}
        onConnected={() => {
          setWeixinQrOpen(false);
          void refreshPageData({ probe: true });
        }}
      />

      <ChannelActionDialog
        action={pendingAction}
        onConfirm={async (action) => {
          setPendingAction(null);
          setActionError(null);
          beginConfigApply();

          const channelId =
            action.kind === "enable-plugin"
              ? resolveChannelIdForPlugin(action.pluginId)
              : action.channelId;

          try {
            if (action.kind === "disable-channel") {
              await enableChannel(action.channelId, false);
              await useGatewayStore.getState().waitForConfigApplySettle();
              return;
            }

            setPendingPostEnableChannel(channelId);

            if (action.kind === "install-channel") {
              const installResult = await installPlugin(action.npmSpec);
              if (!installResult?.ok) {
                setActionError(installResult?.error ?? "Failed to install plugin.");
                setPendingPostEnableChannel(null);
                return;
              }
              await fetchCatalog();
              const activateResult = await activateChannel(action.channelId);
              if (!activateResult.ok) {
                setActionError(activateResult.reason ?? "Installed but failed to enable channel.");
                setPendingPostEnableChannel(null);
              }
              return;
            }

            if (action.kind === "enable-channel") {
              const result = await activateChannel(channelId);
              if (!result.ok) {
                setActionError(result.reason ?? "Failed to enable channel.");
                setPendingPostEnableChannel(null);
              }
              return;
            }

            const { enablePlugin } = usePluginsStore.getState();
            const pluginResult = await enablePlugin(action.pluginId, true);
            if (!pluginResult?.enabled) {
              setActionError(
                pluginResult?.reason ??
                  "Plugin could not be enabled. Check allowlist in Plugins.",
              );
              setPendingPostEnableChannel(null);
              return;
            }
            await useGatewayStore.getState().waitForConfigApplySettle();
            const wait = await useChannelsStore.getState().waitForChannelRuntime(channelId);
            if (!wait.ok) {
              setActionError(
                toggleChannelError[channelId] ??
                  "Plugin enabled but channel did not load in time. Try Refresh.",
              );
            }
          } catch (err) {
            setActionError(String(err));
            setPendingPostEnableChannel(null);
          } finally {
            endRestart();
          }
        }}
        onCancel={() => setPendingAction(null)}
      />
    </>
  );
}
