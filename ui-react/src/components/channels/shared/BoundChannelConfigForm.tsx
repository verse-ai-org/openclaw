import { useChannelsStore } from "@/store/channels.store";
import type { ConfigUiHints } from "@/types/channels";
import { ChannelConfigForm } from "@/components/channels/shared/ChannelConfigForm";

/**
 * Wrapper around ChannelConfigForm that reads all config state directly
 * from useChannelsStore, so callers only need to provide channelId + onSaved.
 */
export function BoundChannelConfigForm({
  channelId,
  onSaved,
}: {
  channelId: string;
  onSaved: () => void;
}) {
  const store = useChannelsStore();
  return (
    <ChannelConfigForm
      channelId={channelId}
      configForm={store.configForm}
      configSchema={store.configSchema}
      configUiHints={store.configUiHints as ConfigUiHints}
      configSaving={store.configSaving}
      configSchemaLoading={store.configSchemaLoading}
      configFormDirty={store.configFormDirty}
      onPatch={store.patchConfig}
      onSave={async () => {
        const ok = await store.saveConfig();
        if (ok) { onSaved(); }
      }}
      onReload={() => void store.reloadConfig()}
    />
  );
}
