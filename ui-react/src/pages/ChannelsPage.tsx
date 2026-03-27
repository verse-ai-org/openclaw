import { useEffect, useState } from "react";
import {
  RefreshCwIcon,
  Loader2Icon,
  ToggleLeftIcon,
  ToggleRightIcon,
  CheckCircle2Icon,
  XCircleIcon,
  AlertCircleIcon,
  SettingsIcon,
  WifiIcon,
  WifiOffIcon,
  PackagePlusIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useChannelsStore } from "@/store/channels.store";
import { useGatewayStore } from "@/store/gateway.store";
import type {
  ChannelAccountSnapshot,
  ChannelCatalogEntry,
  ChannelsStatusSnapshot,
  ConfigUiHints,
  NostrProfile,
  NostrStatus,
  WhatsAppStatus,
} from "@/types/channels";
import { AccountCardList } from "@/components/channels/shared/AccountCardList";
import { ChannelConfigForm } from "@/components/channels/shared/ChannelConfigForm";
import { ChannelStatusList } from "@/components/channels/shared/ChannelStatusList";
import type { StatusItem } from "@/components/channels/shared/ChannelStatusList";
import { ErrorCallout } from "@/components/channels/shared/ErrorCallout";
import { NostrProfileEditor } from "@/components/channels/NostrProfileEditor";
import { WhatsAppLoginPanel } from "@/components/channels/WhatsAppLoginPanel";
import { formatDistanceToNow } from "date-fns";

// ── helpers ───────────────────────────────────────────────────────────────────

function relativeTime(ms: number | null | undefined): string {
  if (!ms) { return "n/a"; }
  return formatDistanceToNow(new Date(ms), { addSuffix: true });
}

function resolveChannelOrder(snapshot: ChannelsStatusSnapshot): string[] {
  if (snapshot.channelMeta?.length) { return snapshot.channelMeta.map((e) => e.id); }
  if (snapshot.channelOrder?.length) { return snapshot.channelOrder; }
  return ["whatsapp", "telegram", "discord", "googlechat", "slack", "signal", "imessage", "nostr"];
}

function isChannelEnabled(accounts: ChannelAccountSnapshot[]): boolean {
  return accounts.length === 0 || accounts.some((a) => a.enabled !== false);
}

type DotStatus = "running" | "error" | "idle" | "disabled";

function channelStatusDot(accounts: ChannelAccountSnapshot[]): DotStatus {
  if (!isChannelEnabled(accounts)) { return "disabled"; }
  if (!accounts.length) { return "idle"; }
  if (accounts.some((a) => a.running)) { return "running"; }
  if (accounts.some((a) => a.lastError)) { return "error"; }
  return "idle";
}

// ── Channel card ──────────────────────────────────────────────────────────────

function ChannelCard({
  channelId, label, detailLabel, accounts, onOpen,
}: {
  channelId: string;
  label: string;
  detailLabel?: string;
  accounts: ChannelAccountSnapshot[];
  onOpen: () => void;
}) {
  const togglingChannelId = useChannelsStore((s) => s.togglingChannelId);
  const toggleChannelError = useChannelsStore((s) => s.toggleChannelError);
  const enableChannel = useChannelsStore((s) => s.enableChannel);
  const isToggling = togglingChannelId === channelId;
  const enabled = isChannelEnabled(accounts);
  const dot = channelStatusDot(accounts);
  const errMsg = toggleChannelError[channelId];
  const running = accounts.filter((a) => a.running).length;
  const configured = accounts.some((a) => a.configured);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    void enableChannel(channelId, !enabled);
  };

  return (
    <div
      role="button" tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className={cn(
        "group relative flex flex-col gap-3 rounded-2xl border bg-white p-5 cursor-pointer",
        "transition-all hover:shadow-md hover:border-[#E0E0E0]",
        !enabled && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cn(
            "size-2.5 rounded-full shrink-0 mt-0.5",
            dot === "running" && "bg-emerald-500",
            dot === "error" && "bg-red-500",
            dot === "idle" && "bg-amber-400",
            dot === "disabled" && "bg-[#D1D5DB]",
          )} />
          <div>
            <p className="text-sm font-semibold text-[#111827] leading-tight">{label}</p>
            {detailLabel && <p className="text-[11px] text-[#9CA3AF] mt-0.5">{detailLabel}</p>}
          </div>
        </div>
        <button type="button" disabled={true} onClick={handleToggle}
          className={cn(
            "shrink-0 transition-colors disabled:opacity-50",
            enabled
              ? "relative inline-flex h-[26px] w-[44px] cursor-pointer items-center rounded-full bg-primary"
              : "rounded-full bg-primary px-5 py-[6px] text-[12px] font-bold text-white hover:bg-primary/90",
          )}
          title={enabled ? "Disable" : "Enable"}
        >
          {isToggling
            ? <Loader2Icon className={cn("size-4 animate-spin", enabled ? "mx-auto text-white" : "")} />
            : enabled
            ? <span className="inline-block size-[22px] translate-x-[20px] rounded-full bg-white shadow-sm transition-transform" />
            : "Enable"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#6B7280]">
        {enabled && accounts.length > 0 && (
          <span className="inline-flex items-center gap-1">
            {dot === "running" ? <WifiIcon className="size-3 text-emerald-500" /> : <WifiOffIcon className="size-3" />}
            {running}/{accounts.length} running
          </span>
        )}
        {enabled && configured && (
          <span className="inline-flex items-center gap-1"><CheckCircle2Icon className="size-3 text-emerald-500" />configured</span>
        )}
        {enabled && !configured && accounts.length > 0 && (
          <span className="inline-flex items-center gap-1"><AlertCircleIcon className="size-3 text-amber-400" />not configured</span>
        )}
        {!enabled && (
          <span className="inline-flex items-center gap-1"><XCircleIcon className="size-3" />disabled</span>
        )}
      </div>

      {errMsg && <p className="text-[11px] text-red-500">{errMsg}</p>}

      {enabled && (
        <div className="flex items-center gap-1 text-[11px] text-[#9CA3AF] group-hover:text-[#6B7280] transition-colors mt-auto pt-1">
          <SettingsIcon className="size-3" />Configure
        </div>
      )}
    </div>
  );
}

// ── Detail dialog contents ────────────────────────────────────────────────────

function GenericDetail({ channelId, snapshot }: { channelId: string; snapshot: ChannelsStatusSnapshot }) {
  const raw = snapshot.channels[channelId] as Record<string, unknown> | undefined;
  const accounts = snapshot.channelAccounts[channelId] ?? [];
  const store = useChannelsStore();
  const statusItems: StatusItem[] = [
    { label: "Configured", value: raw?.configured ? "Yes" : "No" },
    { label: "Running", value: raw?.running ? "Yes" : "No" },
    ...(raw?.connected !== undefined ? [{ label: "Connected", value: raw.connected ? "Yes" : "No" }] : []),
    ...(raw?.lastError ? [{ label: "Last error", value: String(raw.lastError), danger: true }] : []),
  ];
  return (
    <>
      <ChannelStatusList items={statusItems} />
      <AccountCardList accounts={accounts} />
      <ChannelConfigForm channelId={channelId} configForm={store.configForm} configSchema={store.configSchema}
        configUiHints={store.configUiHints as ConfigUiHints} configSaving={store.configSaving} configSchemaLoading={store.configSchemaLoading}
        configFormDirty={store.configFormDirty} onPatch={store.patchConfig}
        onSave={() => void store.saveConfig()} onReload={() => void store.reloadConfig()} />
    </>
  );
}

function WhatsAppDetail({ channelId, snapshot }: { channelId: string; snapshot: ChannelsStatusSnapshot }) {
  const raw = snapshot.channels[channelId] as WhatsAppStatus | undefined;
  const accounts = snapshot.channelAccounts[channelId] ?? [];
  const store = useChannelsStore();
  const statusItems: StatusItem[] = [
    { label: "Configured", value: raw?.configured ? "Yes" : "No" },
    { label: "Linked", value: raw?.linked ? "Yes" : "No" },
    { label: "Connected", value: raw?.connected ? "Yes" : "No" },
    { label: "Reconnect attempts", value: String(raw?.reconnectAttempts ?? 0) },
    { label: "Last connected", value: relativeTime(raw?.lastConnectedAt) },
    ...(raw?.self?.e164 ? [{ label: "Phone", value: raw.self.e164 }] : []),
    ...(raw?.lastError ? [{ label: "Last error", value: raw.lastError, danger: true }] : []),
  ];
  return (
    <>
      <ChannelStatusList items={statusItems} />
      <AccountCardList accounts={accounts} />
      <WhatsAppLoginPanel qrDataUrl={store.whatsappQrDataUrl} message={store.whatsappMessage} busy={store.whatsappBusy}
        linked={raw?.linked ?? false} onStart={() => void store.startWhatsAppLogin(false)}
        onWait={() => void store.waitForWhatsAppScan()} onLogout={() => void store.logoutWhatsApp()} />
      <ChannelConfigForm channelId={channelId} configForm={store.configForm} configSchema={store.configSchema}
        configUiHints={store.configUiHints as ConfigUiHints} configSaving={store.configSaving} configSchemaLoading={store.configSchemaLoading}
        configFormDirty={store.configFormDirty} onPatch={store.patchConfig}
        onSave={() => void store.saveConfig()} onReload={() => void store.reloadConfig()} />
    </>
  );
}

function NostrDetail({ channelId, snapshot }: { channelId: string; snapshot: ChannelsStatusSnapshot }) {
  const raw = snapshot.channels[channelId] as NostrStatus | undefined;
  const accounts = snapshot.channelAccounts[channelId] ?? [];
  const store = useChannelsStore();
  const statusItems: StatusItem[] = [
    { label: "Configured", value: raw?.configured ? "Yes" : "No" },
    { label: "Public key", value: raw?.publicKey ? `${raw.publicKey.slice(0, 12)}…` : "n/a" },
    { label: "Running", value: raw?.running ? "Yes" : "No" },
    ...(raw?.lastError ? [{ label: "Last error", value: raw.lastError, danger: true }] : []),
  ];
  const firstAccount = accounts[0];
  const isEditingThis = store.nostrProfileFormState != null && store.nostrProfileAccountId === firstAccount?.accountId;
  return (
    <>
      <ChannelStatusList items={statusItems} />
      <AccountCardList accounts={accounts} />
      {firstAccount && !isEditingThis && (
        <Button size="sm" variant="outline" className="mt-4 w-full h-7 text-xs"
          onClick={() => store.editNostrProfile(firstAccount.accountId, (raw?.profile as NostrProfile) ?? null)}>
          Edit Nostr Profile
        </Button>
      )}
      {isEditingThis && (
        <NostrProfileEditor formState={store.nostrProfileFormState!} onField={store.updateNostrProfileField}
          onSave={() => void store.saveNostrProfile()} onCancel={store.cancelNostrProfile}
          onImport={() => void store.importNostrProfile()} onToggleAdvanced={store.toggleNostrAdvanced} />
      )}
      <ChannelConfigForm channelId={channelId} configForm={store.configForm} configSchema={store.configSchema}
        configUiHints={store.configUiHints as ConfigUiHints} configSaving={store.configSaving} configSchemaLoading={store.configSchemaLoading}
        configFormDirty={store.configFormDirty} onPatch={store.patchConfig}
        onSave={() => void store.saveConfig()} onReload={() => void store.reloadConfig()} />
    </>
  );
}

function ChannelDetail({ channelId, snapshot }: { channelId: string; snapshot: ChannelsStatusSnapshot }) {
  const togglingChannelId = useChannelsStore((s) => s.togglingChannelId);
  const enableChannel = useChannelsStore((s) => s.enableChannel);
  const accounts = snapshot.channelAccounts[channelId] ?? [];
  const enabled = isChannelEnabled(accounts);
  const isToggling = togglingChannelId === channelId;
  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <ToggleLeftIcon className="size-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">This channel is disabled.</p>
        <Button size="sm" disabled={isToggling} onClick={() => void enableChannel(channelId, true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {isToggling ? <Loader2Icon className="size-3.5 animate-spin mr-1" /> : <ToggleRightIcon className="size-4 mr-1" />}
          Enable channel
        </Button>
        <p className="text-xs text-muted-foreground/60 max-w-xs">You may need to restart the gateway for changes to take effect.</p>
      </div>
    );
  }
  if (channelId === "whatsapp") { return <WhatsAppDetail channelId={channelId} snapshot={snapshot} />; }
  if (channelId === "nostr") { return <NostrDetail channelId={channelId} snapshot={snapshot} />; }
  return <GenericDetail channelId={channelId} snapshot={snapshot} />;
}

// ── Catalog card (installable channels) ─────────────────────────────────────

function CatalogCard({ entry }: { entry: ChannelCatalogEntry }) {
  const docsUrl = entry.docsPath
    ? `https://docs.openclaw.ai${entry.docsPath}`
    : undefined;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="size-2.5 rounded-full shrink-0 mt-0.5 bg-[#D1D5DB]" />
          <div>
            <p className="text-sm font-semibold text-[#111827] leading-tight">{entry.label}</p>
            {entry.detailLabel && (
              <p className="text-[11px] text-[#9CA3AF] mt-0.5">{entry.detailLabel}</p>
            )}
          </div>
        </div>
        {docsUrl && (
          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Docs <ExternalLinkIcon className="size-3" />
          </a>
        )}
      </div>

      {entry.blurb && (
        <p className="text-[12px] text-[#6B7280] leading-relaxed">{entry.blurb}</p>
      )}

      {entry.npmSpec && (
        <div className="mt-auto pt-1 flex items-center gap-1.5">
          <PackagePlusIcon className="size-3.5 text-[#9CA3AF]" />
          <code className="text-[11px] text-[#6B7280] font-mono">
            npm install -g {entry.npmSpec}
          </code>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ChannelsPage() {
  const isConnected = useGatewayStore((s) => s.status === "connected");
  const { snapshot, loading, lastError, fetchStatus, fetchConfigSchema, fetchConfigForm, fetchCatalog, catalog, catalogLoading, catalogError } = useChannelsStore();
  const [openChannelId, setOpenChannelId] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected) { return; }
    void fetchStatus(true);
    void fetchConfigSchema();
    void fetchConfigForm();
    void fetchCatalog();
  }, [isConnected, fetchStatus, fetchConfigSchema, fetchConfigForm, fetchCatalog]);

  const handleRefresh = () => { void fetchStatus(true); void fetchConfigForm(); void fetchCatalog(); };

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
  const enabledChannels = allChannels.filter((id) => isChannelEnabled(snapshot?.channelAccounts[id] ?? []));
  const disabledChannels = allChannels.filter((id) => !isChannelEnabled(snapshot?.channelAccounts[id] ?? []));
  // Catalog entries that are not yet installed
  const discoverEntries = (catalog ?? []).filter((e) => !e.installed && !installedIds.has(e.id));

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
                onOpen={() => setOpenChannelId(channelId)} />
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

        {/* Tabs: Active / Disabled */}
        <Tabs defaultValue="active">
          <TabsList className="inline-flex h-auto gap-1 rounded-2xl bg-[#F6F6F6] p-1">
            <TabsTrigger value="active"
              className="rounded-[14px] px-6 py-2 text-[13px] font-semibold text-muted-foreground transition-all
                data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm">
              Active ({enabledChannels.length})
            </TabsTrigger>
            <TabsTrigger value="disabled"
              className="rounded-[14px] px-6 py-2 text-[13px] font-semibold text-muted-foreground transition-all
                data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm">
              Disabled ({disabledChannels.length})
            </TabsTrigger>
            <TabsTrigger value="discover"
              className="rounded-[14px] px-6 py-2 text-[13px] font-semibold text-muted-foreground transition-all
                data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm">
              Discover {discoverEntries.length > 0 && `(${discoverEntries.length})`}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="mt-6">
            {renderGrid(enabledChannels)}
          </TabsContent>
          <TabsContent value="disabled" className="mt-6">
            {renderGrid(disabledChannels)}
          </TabsContent>
          <TabsContent value="discover" className="mt-6">
            {catalogLoading && !catalog && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2Icon className="size-4 animate-spin" /> Loading catalog…
              </div>
            )}
            {catalogError && <ErrorCallout message={catalogError} />}
            {!catalogLoading && !catalogError && discoverEntries.length === 0 && (
              <p className="text-sm text-muted-foreground">All available channels are already installed.</p>
            )}
            {discoverEntries.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {discoverEntries.map((entry) => (
                  <CatalogCard key={entry.id} entry={entry} />
                ))}
              </div>
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
          <ScrollArea className="flex-1">
            <div className="px-1 pb-4">
              {openChannelId && snapshot && (
                <ChannelDetail channelId={openChannelId} snapshot={snapshot} />
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
