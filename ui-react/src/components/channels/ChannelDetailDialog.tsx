import { useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ChannelsStatusSnapshot } from "@/types/channels";
import { ChannelDetail } from "@/components/channels/ChannelDetail";
import { useChannelsStore } from "@/store/channels.store";

export function ChannelDetailDialog({
  channelId,
  snapshot,
  onClose,
  onSaved
}: {
  channelId: string | null;
  snapshot: ChannelsStatusSnapshot | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fetchStatus = useChannelsStore((s) => s.fetchStatus);
  const label = channelId
    ? (snapshot?.channelLabels?.[channelId]
        ?? snapshot?.channelMeta?.find((m) => m.id === channelId)?.label
        ?? channelId)
    : "Channel";

  useEffect(() => {
    if (!channelId) return;
    void fetchStatus(false);
  }, [channelId, fetchStatus]);

  return (
    <Dialog open={channelId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="w-[640px] max-w-[90vw] max-h-[80vh] flex flex-col rounded-2xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 min-h-0 overflow-auto">
          <div className="px-1 pb-4">
            {channelId && snapshot && (
              <ChannelDetail
                channelId={channelId}
                snapshot={snapshot}
                onSaved={onSaved}
              />
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
