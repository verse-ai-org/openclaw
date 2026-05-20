import { resolveChannelLifecycle } from "@/lib/channel-lifecycle";
import type { ChannelCatalogEntry, ChannelsStatusSnapshot } from "@/types/channels";
import { ChannelCard } from "@/components/channels/ChannelCard";

/**
 * Renders a 2-column grid of ChannelCard items.
 * Shows a "None." placeholder when the list is empty.
 */
export function ChannelGrid({
  channelIds,
  snapshot,
  catalog,
  onOpen,
  onDisable,
  onEnable,
}: {
  channelIds: string[];
  snapshot: ChannelsStatusSnapshot | null;
  catalog?: ChannelCatalogEntry[] | null;
  onOpen: (channelId: string) => void;
  onDisable: (channelId: string) => void;
  onEnable: (channelId: string) => void;
}) {
  if (channelIds.length === 0) {
    return <p className="text-sm text-muted-foreground">None.</p>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {channelIds.map((channelId) => {
        const label =
          snapshot?.channelLabels?.[channelId] ??
          snapshot?.channelMeta?.find((entry) => entry.id === channelId)?.label ??
          channelId;
        const detailLabel = snapshot?.channelDetailLabels?.[channelId];
        const accounts = snapshot?.channelAccounts[channelId] ?? [];
        const catalogEntry = catalog?.find((entry) => entry.id === channelId);
        const lifecycle = resolveChannelLifecycle({
          channelId,
          snapshot,
          catalogEntry,
        });
        return (
          <ChannelCard
            key={channelId}
            channelId={channelId}
            label={label}
            detailLabel={detailLabel}
            accounts={accounts}
            lifecycle={lifecycle}
            onOpen={() => onOpen(channelId)}
            onDisable={() => onDisable(channelId)}
            onEnable={() => onEnable(channelId)}
          />
        );
      })}
    </div>
  );
}
