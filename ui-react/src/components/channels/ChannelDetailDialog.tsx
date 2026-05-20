import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  channelNeedsSetup,
  resolveChannelLifecycle,
} from "@/lib/channel-lifecycle";
import type { ChannelCatalogEntry, ChannelsStatusSnapshot } from "@/types/channels";
import { ChannelLifecycleBadge } from "@/components/channels/ChannelLifecycleBadge";
import { ChannelDetail } from "@/components/channels/ChannelDetail";

export function ChannelDetailDialog({
  channelId,
  snapshot,
  catalog,
  onClose,
  onSaved,
}: {
  channelId: string | null;
  snapshot: ChannelsStatusSnapshot | null;
  catalog?: ChannelCatalogEntry[] | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const label = channelId
    ? (snapshot?.channelLabels?.[channelId]
        ?? snapshot?.channelMeta?.find((m) => m.id === channelId)?.label
        ?? catalog?.find((entry) => entry.id === channelId)?.label
        ?? channelId)
    : "Channel";

  const lifecycle =
    channelId && snapshot
      ? resolveChannelLifecycle({
          channelId,
          snapshot,
          catalogEntry: catalog?.find((entry) => entry.id === channelId),
        })
      : null;

  const accounts = channelId && snapshot ? (snapshot.channelAccounts[channelId] ?? []) : [];
  const runningCount = accounts.filter((account) => account.running === true).length;

  const setupHint =
    lifecycle && channelNeedsSetup(lifecycle)
      ? "Add credentials or complete login below to start receiving messages."
      : lifecycle === "error"
        ? "Fix the error below, then save config or retry the connection."
        : lifecycle === "running"
          ? `${runningCount}/${accounts.length || 1} account(s) running.`
          : lifecycle === "configured"
            ? "Channel is configured. Open technical status below for probe details."
            : null;

  return (
    <Dialog open={channelId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="w-[640px] max-w-[90vw] max-h-[80vh] flex flex-col rounded-2xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-lg">{label}</DialogTitle>
            {lifecycle && <ChannelLifecycleBadge lifecycle={lifecycle} />}
          </div>
          {setupHint && <DialogDescription>{setupHint}</DialogDescription>}
        </DialogHeader>
        <ScrollArea className="flex-1 min-h-0 overflow-auto">
          <div className="px-1 pb-4">
            {channelId && snapshot && (
              <ChannelDetail
                channelId={channelId}
                snapshot={snapshot}
                catalogEntry={catalog?.find((entry) => entry.id === channelId)}
                onSaved={onSaved}
              />
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
