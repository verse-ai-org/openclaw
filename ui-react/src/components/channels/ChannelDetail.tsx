import React from "react";
import { Button } from "@/components/ui/button";
import { isBenignAccountStatusError } from "@/lib/channel-lifecycle";
import { relativeTime } from "@/lib/relative-time";
import { useChannelsStore } from "@/store/channels.store";
import type {
  ChannelCatalogEntry,
  ChannelsStatusSnapshot,
  NostrProfile,
  NostrStatus,
  WhatsAppStatus,
} from "@/types/channels";
import { AccountCardList } from "@/components/channels/shared/AccountCardList";
import { BoundChannelConfigForm } from "@/components/channels/shared/BoundChannelConfigForm";
import type { StatusItem } from "@/components/channels/shared/ChannelStatusList";
import { ChannelDetailLayout } from "@/components/channels/ChannelDetailLayout";
import { NostrProfileEditor } from "@/components/channels/NostrProfileEditor";
import { WhatsAppLoginPanel } from "@/components/channels/WhatsAppLoginPanel";
import { WeixinLoginPanel } from "@/components/channels/WeixinLoginPanel";

type DetailProps = {
  channelId: string;
  snapshot: ChannelsStatusSnapshot;
  catalogEntry?: ChannelCatalogEntry;
  onSaved: () => void;
};

function channelLastErrorStatusItem(
  lastError: unknown,
): StatusItem | null {
  if (typeof lastError !== "string" || !lastError.trim()) {
    return null;
  }
  const benign = isBenignAccountStatusError(lastError);
  return {
    label: benign ? "Status" : "Last error",
    value: lastError,
    danger: benign ? undefined : true,
  };
}

function GenericDetail({ channelId, snapshot, catalogEntry, onSaved }: DetailProps) {
  const raw = snapshot.channels[channelId] as Record<string, unknown> | undefined;
  const accounts = snapshot.channelAccounts[channelId] ?? [];
  const statusItems: StatusItem[] = [
    { label: "Configured", value: raw?.configured ? "Yes" : "No" },
    { label: "Running", value: raw?.running ? "Yes" : "No" },
    ...(raw?.connected !== undefined
      ? [{ label: "Connected", value: raw.connected ? "Yes" : "No" }]
      : []),
    ...(channelLastErrorStatusItem(raw?.lastError) ? [channelLastErrorStatusItem(raw?.lastError)!] : []),
  ];
  return (
    <ChannelDetailLayout
      channelId={channelId}
      snapshot={snapshot}
      catalogEntry={catalogEntry}
      statusItems={statusItems}
      primary={<BoundChannelConfigForm channelId={channelId} onSaved={onSaved} />}
      secondary={<AccountCardList accounts={accounts} />}
    />
  );
}

function WhatsAppDetail({ channelId, snapshot, catalogEntry, onSaved }: DetailProps) {
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
    ...(channelLastErrorStatusItem(raw?.lastError) ? [channelLastErrorStatusItem(raw?.lastError)!] : []),
  ];
  return (
    <ChannelDetailLayout
      channelId={channelId}
      snapshot={snapshot}
      catalogEntry={catalogEntry}
      statusItems={statusItems}
      primary={
        <>
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
      }
      secondary={<AccountCardList accounts={accounts} />}
    />
  );
}

function WeixinDetail({ channelId, snapshot, catalogEntry, onSaved: _onSaved }: DetailProps) {
  const raw = snapshot.channels[channelId] as Record<string, unknown> | undefined;
  const accounts = snapshot.channelAccounts[channelId] ?? [];
  const store = useChannelsStore();
  const statusItems: StatusItem[] = [
    { label: "Configured", value: raw?.configured ? "Yes" : "No" },
    { label: "Running", value: raw?.running ? "Yes" : "No" },
    ...(channelLastErrorStatusItem(raw?.lastError) ? [channelLastErrorStatusItem(raw?.lastError)!] : []),
  ];
  return (
    <ChannelDetailLayout
      channelId={channelId}
      snapshot={snapshot}
      catalogEntry={catalogEntry}
      statusItems={statusItems}
      primary={
        <WeixinLoginPanel
          qrDataUrl={store.weixinQrDataUrl}
          message={store.weixinMessage}
          busy={store.weixinBusy}
          connected={store.weixinConnected || Boolean(raw?.configured)}
          needsVerifyCode={store.weixinNeedsVerifyCode}
          verifyCode={store.weixinVerifyCode}
          onVerifyCodeChange={(value) =>
            useChannelsStore.setState({ weixinVerifyCode: value })
          }
          onStart={() => void store.startWeixinLogin(true)}
          onWait={() => void store.waitForWeixinScan()}
          onLogout={() => void store.logoutWeixin()}
        />
      }
      secondary={<AccountCardList accounts={accounts} />}
    />
  );
}

function NostrDetail({ channelId, snapshot, catalogEntry, onSaved }: DetailProps) {
  const raw = snapshot.channels[channelId] as NostrStatus | undefined;
  const accounts = snapshot.channelAccounts[channelId] ?? [];
  const store = useChannelsStore();
  const statusItems: StatusItem[] = [
    { label: "Configured", value: raw?.configured ? "Yes" : "No" },
    { label: "Public key", value: raw?.publicKey ? `${raw.publicKey.slice(0, 12)}\u2026` : "n/a" },
    { label: "Running", value: raw?.running ? "Yes" : "No" },
    ...(channelLastErrorStatusItem(raw?.lastError) ? [channelLastErrorStatusItem(raw?.lastError)!] : []),
  ];
  const firstAccount = accounts[0];
  const isEditingThis =
    store.nostrProfileFormState != null &&
    store.nostrProfileAccountId === firstAccount?.accountId;

  const profileSection =
    firstAccount && !isEditingThis ? (
      <Button
        size="sm"
        variant="outline"
        className="w-full h-8 text-xs"
        onClick={() =>
          store.editNostrProfile(firstAccount.accountId, (raw?.profile as NostrProfile) ?? null)
        }
      >
        Edit Nostr Profile
      </Button>
    ) : isEditingThis ? (
      <NostrProfileEditor
        formState={store.nostrProfileFormState!}
        onField={store.updateNostrProfileField}
        onSave={() => void store.saveNostrProfile()}
        onCancel={store.cancelNostrProfile}
        onImport={() => void store.importNostrProfile()}
        onToggleAdvanced={store.toggleNostrAdvanced}
      />
    ) : null;

  return (
    <ChannelDetailLayout
      channelId={channelId}
      snapshot={snapshot}
      catalogEntry={catalogEntry}
      statusItems={statusItems}
      primary={
        <>
          {profileSection}
          <BoundChannelConfigForm channelId={channelId} onSaved={onSaved} />
        </>
      }
      secondary={<AccountCardList accounts={accounts} />}
    />
  );
}

const CHANNEL_DETAIL_REGISTRY: Partial<Record<string, React.ComponentType<DetailProps>>> = {
  whatsapp: WhatsAppDetail,
  nostr: NostrDetail,
  "openclaw-weixin": WeixinDetail,
};

export function ChannelDetail({
  channelId,
  snapshot,
  catalogEntry,
  onSaved,
}: {
  channelId: string;
  snapshot: ChannelsStatusSnapshot;
  catalogEntry?: ChannelCatalogEntry;
  onSaved: () => void;
}) {
  const DetailComponent = CHANNEL_DETAIL_REGISTRY[channelId] ?? GenericDetail;
  return (
    <DetailComponent
      channelId={channelId}
      snapshot={snapshot}
      catalogEntry={catalogEntry}
      onSaved={onSaved}
    />
  );
}
