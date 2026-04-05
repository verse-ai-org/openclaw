import React from "react";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/relative-time";
import { useChannelsStore } from "@/store/channels.store";
import type {
  ChannelsStatusSnapshot,
  NostrProfile,
  NostrStatus,
  WhatsAppStatus,
} from "@/types/channels";
import { AccountCardList } from "@/components/channels/shared/AccountCardList";
import { BoundChannelConfigForm } from "@/components/channels/shared/BoundChannelConfigForm";
import { ChannelStatusList } from "@/components/channels/shared/ChannelStatusList";
import type { StatusItem } from "@/components/channels/shared/ChannelStatusList";
import { NostrProfileEditor } from "@/components/channels/NostrProfileEditor";
import { WhatsAppLoginPanel } from "@/components/channels/WhatsAppLoginPanel";
import { WeixinLoginPanel } from "@/components/channels/WeixinLoginPanel";

function GenericDetail({ channelId, snapshot, onSaved }: {
  channelId: string;
  snapshot: ChannelsStatusSnapshot;
  onSaved: () => void;
}) {
  const raw = snapshot.channels[channelId] as Record<string, unknown> | undefined;
  const accounts = snapshot.channelAccounts[channelId] ?? [];
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
      <BoundChannelConfigForm channelId={channelId} onSaved={onSaved} />
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
      <BoundChannelConfigForm channelId={channelId} onSaved={onSaved} />
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
      <BoundChannelConfigForm channelId={channelId} onSaved={onSaved} />
    </>
  );
}

// ── Channel-specific detail registry ────────────────────────────────────────

type DetailProps = {
  channelId: string;
  snapshot: ChannelsStatusSnapshot;
  onSaved: () => void;
};

const CHANNEL_DETAIL_REGISTRY: Partial<Record<string, React.ComponentType<DetailProps>>> = {
  whatsapp: WhatsAppDetail,
  nostr: NostrDetail,
  "openclaw-weixin": WeixinDetail,
};

export function ChannelDetail({ channelId, snapshot, onSaved }: {
  channelId: string;
  snapshot: ChannelsStatusSnapshot;
  onSaved: () => void;
  onEnable?: () => void;
}) {
  const DetailComponent = CHANNEL_DETAIL_REGISTRY[channelId] ?? GenericDetail;
  return <DetailComponent channelId={channelId} snapshot={snapshot} onSaved={onSaved} />;
}
