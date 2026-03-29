import { Loader2Icon, ToggleLeftIcon, ToggleRightIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { useChannelsStore } from "@/store/channels.store";
import type {
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
import { NostrProfileEditor } from "@/components/channels/NostrProfileEditor";
import { WhatsAppLoginPanel } from "@/components/channels/WhatsAppLoginPanel";
import { WeixinLoginPanel } from "@/components/channels/WeixinLoginPanel";
import { isChannelEnabled } from "@/components/channels/ChannelCard";

function relativeTime(ms: number | null | undefined): string {
  if (!ms) { return "n/a"; }
  return formatDistanceToNow(new Date(ms), { addSuffix: true });
}

function GenericDetail({ channelId, snapshot, onSaved }: {
  channelId: string;
  snapshot: ChannelsStatusSnapshot;
  onSaved: () => void;
}) {
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
      <ChannelConfigForm
        channelId={channelId}
        configForm={store.configForm}
        configSchema={store.configSchema}
        configUiHints={store.configUiHints as ConfigUiHints}
        configSaving={store.configSaving}
        configSchemaLoading={store.configSchemaLoading}
        configFormDirty={store.configFormDirty}
        onPatch={store.patchConfig}
        onSave={async () => { const ok = await store.saveConfig(); if (ok) { onSaved(); } }}
        onReload={() => void store.reloadConfig()}
      />
    </>
  );
}

function WhatsAppDetail({ channelId, snapshot, onSaved }: {
  channelId: string;
  snapshot: ChannelsStatusSnapshot;
  onSaved: () => void;
}) {
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
      <WhatsAppLoginPanel
        qrDataUrl={store.whatsappQrDataUrl}
        message={store.whatsappMessage}
        busy={store.whatsappBusy}
        linked={raw?.linked ?? false}
        onStart={() => void store.startWhatsAppLogin(false)}
        onWait={() => void store.waitForWhatsAppScan()}
        onLogout={() => void store.logoutWhatsApp()}
      />
      <ChannelConfigForm
        channelId={channelId}
        configForm={store.configForm}
        configSchema={store.configSchema}
        configUiHints={store.configUiHints as ConfigUiHints}
        configSaving={store.configSaving}
        configSchemaLoading={store.configSchemaLoading}
        configFormDirty={store.configFormDirty}
        onPatch={store.patchConfig}
        onSave={async () => { const ok = await store.saveConfig(); if (ok) { onSaved(); } }}
        onReload={() => void store.reloadConfig()}
      />
    </>
  );
}

function WeixinDetail({ channelId, snapshot, onSaved: _onSaved }: {
  channelId: string;
  snapshot: ChannelsStatusSnapshot;
  onSaved: () => void;
}) {
  const raw = snapshot.channels[channelId] as Record<string, unknown> | undefined;
  const accounts = snapshot.channelAccounts[channelId] ?? [];
  const store = useChannelsStore();
  const statusItems: StatusItem[] = [
    { label: "Configured", value: raw?.configured ? "Yes" : "No" },
    { label: "Running", value: raw?.running ? "Yes" : "No" },
    ...(raw?.lastError ? [{ label: "Last error", value: String(raw.lastError), danger: true }] : []),
  ];
  return (
    <>
      <ChannelStatusList items={statusItems} />
      <AccountCardList accounts={accounts} />
      <WeixinLoginPanel
        qrDataUrl={store.weixinQrDataUrl}
        message={store.weixinMessage}
        busy={store.weixinBusy}
        connected={store.weixinConnected || Boolean(raw?.configured)}
        onStart={() => void store.startWeixinLogin(false)}
        onWait={() => void store.waitForWeixinScan()}
        onLogout={() => void store.logoutWeixin()}
      />
    </>
  );
}

function NostrDetail({ channelId, snapshot, onSaved }: {
  channelId: string;
  snapshot: ChannelsStatusSnapshot;
  onSaved: () => void;
}) {
  const raw = snapshot.channels[channelId] as NostrStatus | undefined;
  const accounts = snapshot.channelAccounts[channelId] ?? [];
  const store = useChannelsStore();
  const statusItems: StatusItem[] = [
    { label: "Configured", value: raw?.configured ? "Yes" : "No" },
    { label: "Public key", value: raw?.publicKey ? `${raw.publicKey.slice(0, 12)}\u2026` : "n/a" },
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
        <NostrProfileEditor
          formState={store.nostrProfileFormState!}
          onField={store.updateNostrProfileField}
          onSave={() => void store.saveNostrProfile()}
          onCancel={store.cancelNostrProfile}
          onImport={() => void store.importNostrProfile()}
          onToggleAdvanced={store.toggleNostrAdvanced}
        />
      )}
      <ChannelConfigForm
        channelId={channelId}
        configForm={store.configForm}
        configSchema={store.configSchema}
        configUiHints={store.configUiHints as ConfigUiHints}
        configSaving={store.configSaving}
        configSchemaLoading={store.configSchemaLoading}
        configFormDirty={store.configFormDirty}
        onPatch={store.patchConfig}
        onSave={async () => { const ok = await store.saveConfig(); if (ok) { onSaved(); } }}
        onReload={() => void store.reloadConfig()}
      />
    </>
  );
}

export function ChannelDetail({ channelId, snapshot, onSaved }: {
  channelId: string;
  snapshot: ChannelsStatusSnapshot;
  onSaved: () => void;
}) {
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
  if (channelId === "whatsapp") { return <WhatsAppDetail channelId={channelId} snapshot={snapshot} onSaved={onSaved} />; }
  if (channelId === "nostr") { return <NostrDetail channelId={channelId} snapshot={snapshot} onSaved={onSaved} />; }
  if (channelId === "openclaw-weixin") { return <WeixinDetail channelId={channelId} snapshot={snapshot} onSaved={onSaved} />; }
  return <GenericDetail channelId={channelId} snapshot={snapshot} onSaved={onSaved} />;
}
