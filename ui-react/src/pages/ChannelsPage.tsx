import { useEffect, useState } from "react";
import { RefreshCwIcon, ChevronRightIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useChannelsStore } from "@/store/channels.store";
import { useGatewayStore } from "@/store/gateway.store";
import type {
  ChannelAccountSnapshot,
  ChannelsStatusSnapshot,
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

const FALLBACK_CHANNEL_ORDER = [
  "whatsapp", "telegram", "discord", "googlechat", "slack", "signal", "imessage", "nostr",
];

function resolveChannelOrder(snapshot: ChannelsStatusSnapshot): string[] {
  if (snapshot.channelMeta?.length) { return snapshot.channelMeta.map((e) => e.id); }
  if (snapshot.channelOrder?.length) { return snapshot.channelOrder; }
  return FALLBACK_CHANNEL_ORDER;
}

function relativeTime(ms: number | null | undefined): string {
  if (!ms) { return "n/a"; }
  return formatDistanceToNow(new Date(ms), { addSuffix: true });
}

function channelColorDot(accounts: ChannelAccountSnapshot[]): string {
  if (!accounts.length) { return "bg-muted-foreground/30"; }
  const anyRunning = accounts.some((a) => a.running);
  const anyError = accounts.some((a) => a.lastError);
  if (anyError && !anyRunning) { return "bg-destructive"; }
  if (anyRunning) { return "bg-emerald-500"; }
  return "bg-muted-foreground/40";
}

function ChannelListItem({
  channelId,
  label,
  accounts,
  selected,
  onClick,
}: {
  channelId: string;
  label: string;
  accounts: ChannelAccountSnapshot[];
  selected: boolean;
  onClick: () => void;
}) {
  const running = accounts.filter((a) => a.running).length;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg transition-colors",
        selected
          ? "bg-accent text-accent-foreground"
          : "hover:bg-muted/60 text-muted-foreground hover:text-foreground",
      )}
    >
      <span className={cn("size-2 rounded-full shrink-0", channelColorDot(accounts))} />
      <span className="flex-1 text-sm font-medium truncate">{label}</span>
      {accounts.length > 0 && (
        <span className="text-xs tabular-nums shrink-0">{running}/{accounts.length}</span>
      )}
      <ChevronRightIcon
        className={cn("size-3.5 shrink-0 transition-transform", selected ? "rotate-90" : "")}
      />
    </button>
  );
}

function GenericChannelDetail({ channelId, snapshot }: { channelId: string; snapshot: ChannelsStatusSnapshot }) {
  const raw = snapshot.channels[channelId] as Record<string, unknown> | undefined;
  const accounts = snapshot.channelAccounts[channelId] ?? [];
  const { configForm, configSchema, configUiHints, configSaving, configSchemaLoading, configFormDirty, patchConfig, saveConfig, reloadConfig } = useChannelsStore();
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
      <ChannelConfigForm channelId={channelId} configForm={configForm} configSchema={configSchema}
        configUiHints={configUiHints} configSaving={configSaving} configSchemaLoading={configSchemaLoading}
        configFormDirty={configFormDirty} onPatch={patchConfig}
        onSave={() => void saveConfig()} onReload={() => void reloadConfig()} />
    </>
  );
}

function WhatsAppDetail({ channelId, snapshot }: { channelId: string; snapshot: ChannelsStatusSnapshot }) {
  const raw = snapshot.channels[channelId] as WhatsAppStatus | undefined;
  const accounts = snapshot.channelAccounts[channelId] ?? [];
  const { whatsappQrDataUrl, whatsappMessage, whatsappBusy, startWhatsAppLogin, waitForWhatsAppScan, logoutWhatsApp,
    configForm, configSchema, configUiHints, configSaving, configSchemaLoading, configFormDirty, patchConfig, saveConfig, reloadConfig } = useChannelsStore();
  const statusItems: StatusItem[] = [
    { label: "Configured", value: raw?.configured ? "Yes" : "No" },
    { label: "Linked", value: raw?.linked ? "Yes" : "No" },
    { label: "Connected", value: raw?.connected ? "Yes" : "No" },
    { label: "Reconnect attempts", value: String(raw?.reconnectAttempts ?? 0) },
    { label: "Last connected", value: relativeTime(raw?.lastConnectedAt) },
    { label: "Last message", value: relativeTime(raw?.lastMessageAt) },
    ...(raw?.self?.e164 ? [{ label: "Phone", value: raw.self.e164 }] : []),
    ...(raw?.lastError ? [{ label: "Last error", value: raw.lastError, danger: true }] : []),
  ];
  return (
    <>
      <ChannelStatusList items={statusItems} />
      <AccountCardList accounts={accounts} />
      <WhatsAppLoginPanel qrDataUrl={whatsappQrDataUrl} message={whatsappMessage} busy={whatsappBusy}
        linked={raw?.linked ?? false} onStart={() => void startWhatsAppLogin(false)}
        onWait={() => void waitForWhatsAppScan()} onLogout={() => void logoutWhatsApp()} />
      <ChannelConfigForm channelId={channelId} configForm={configForm} configSchema={configSchema}
        configUiHints={configUiHints} configSaving={configSaving} configSchemaLoading={configSchemaLoading}
        configFormDirty={configFormDirty} onPatch={patchConfig}
        onSave={() => void saveConfig()} onReload={() => void reloadConfig()} />
    </>
  );
}

function NostrDetail({ channelId, snapshot }: { channelId: string; snapshot: ChannelsStatusSnapshot }) {
  const raw = snapshot.channels[channelId] as NostrStatus | undefined;
  const accounts = snapshot.channelAccounts[channelId] ?? [];
  const { nostrProfileFormState, nostrProfileAccountId, editNostrProfile, cancelNostrProfile,
    updateNostrProfileField, saveNostrProfile, importNostrProfile, toggleNostrAdvanced,
    configForm, configSchema, configUiHints, configSaving, configSchemaLoading, configFormDirty,
    patchConfig, saveConfig, reloadConfig } = useChannelsStore();
  const statusItems: StatusItem[] = [
    { label: "Configured", value: raw?.configured ? "Yes" : "No" },
    { label: "Public key", value: raw?.publicKey ? `${raw.publicKey.slice(0, 12)}…` : "n/a" },
    { label: "Running", value: raw?.running ? "Yes" : "No" },
    ...(raw?.lastError ? [{ label: "Last error", value: raw.lastError, danger: true }] : []),
  ];
  const firstAccount = accounts[0];
  const isEditingThis = nostrProfileFormState != null && nostrProfileAccountId === firstAccount?.accountId;
  return (
    <>
      <ChannelStatusList items={statusItems} />
      <AccountCardList accounts={accounts} />
      {firstAccount && !isEditingThis && (
        <Button size="sm" variant="outline" className="mt-4 w-full h-7 text-xs"
          onClick={() => editNostrProfile(firstAccount.accountId, (raw?.profile as NostrProfile) ?? null)}>
          Edit Nostr Profile
        </Button>
      )}
      {isEditingThis && (
        <NostrProfileEditor formState={nostrProfileFormState} onField={updateNostrProfileField}
          onSave={() => void saveNostrProfile()} onCancel={cancelNostrProfile}
          onImport={() => void importNostrProfile()} onToggleAdvanced={toggleNostrAdvanced} />
      )}
      <ChannelConfigForm channelId={channelId} configForm={configForm} configSchema={configSchema}
        configUiHints={configUiHints} configSaving={configSaving} configSchemaLoading={configSchemaLoading}
        configFormDirty={configFormDirty} onPatch={patchConfig}
        onSave={() => void saveConfig()} onReload={() => void reloadConfig()} />
    </>
  );
}

function ChannelDetail({ channelId, snapshot }: { channelId: string; snapshot: ChannelsStatusSnapshot }) {
  if (channelId === "whatsapp") return <WhatsAppDetail channelId={channelId} snapshot={snapshot} />;
  if (channelId === "nostr") return <NostrDetail channelId={channelId} snapshot={snapshot} />;
  return <GenericChannelDetail channelId={channelId} snapshot={snapshot} />;
}

export function ChannelsPage() {
  const isConnected = useGatewayStore((s) => s.status === "connected");
  const { snapshot, loading, lastError, lastSuccessAt, fetchStatus, fetchConfigSchema, fetchConfigForm } = useChannelsStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    void fetchStatus(true);
    void fetchConfigSchema();
    void fetchConfigForm();
  }, [isConnected, fetchStatus, fetchConfigSchema, fetchConfigForm]);

  useEffect(() => {
    if (!snapshot) return;
    const order = resolveChannelOrder(snapshot);
    if (selectedId && order.includes(selectedId)) return;
    if (order.length > 0) setSelectedId(order[0]);
  }, [snapshot, selectedId]);

  const handleRefresh = () => { void fetchStatus(true); void fetchConfigForm(); };

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
  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <p className="text-sm">No channel data yet.</p>
        <Button size="sm" variant="outline" onClick={handleRefresh}>Refresh</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-52 shrink-0 border-r flex flex-col">
        <div className="flex items-center justify-between px-3 py-3 border-b shrink-0">
          <h2 className="text-sm font-semibold">Channels</h2>
          <Button size="icon" variant="ghost" className="size-7" disabled={loading}
            onClick={handleRefresh} title="Refresh">
            <RefreshCwIcon className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {resolveChannelOrder(snapshot).map((channelId) => {
              const label = snapshot.channelLabels[channelId] ??
                snapshot.channelMeta?.find((m) => m.id === channelId)?.label ?? channelId;
              const accounts = snapshot.channelAccounts[channelId] ?? [];
              return (
                <ChannelListItem key={channelId} channelId={channelId} label={label}
                  accounts={accounts} selected={selectedId === channelId}
                  onClick={() => setSelectedId(channelId)} />
              );
            })}
          </div>
        </ScrollArea>
        {lastSuccessAt && (
          <p className="text-xs text-muted-foreground px-3 py-2 border-t shrink-0">
            Updated {relativeTime(lastSuccessAt)}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {selectedId ? (
          <>
            <div className="px-5 py-3 border-b shrink-0 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">
                  {snapshot.channelLabels[selectedId] ??
                    snapshot.channelMeta?.find((m) => m.id === selectedId)?.label ?? selectedId}
                </h2>
                {snapshot.channelDetailLabels?.[selectedId] && (
                  <p className="text-xs text-muted-foreground">{snapshot.channelDetailLabels[selectedId]}</p>
                )}
              </div>
              {loading && <Loader2Icon className="size-4 animate-spin text-muted-foreground" />}
            </div>
            <ScrollArea className="flex-1">
              <div className="px-5 py-4">
                {lastError && <ErrorCallout message={lastError} />}
                <ChannelDetail channelId={selectedId} snapshot={snapshot} />
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Select a channel to view details.
          </div>
        )}
      </div>
    </div>
  );
}
