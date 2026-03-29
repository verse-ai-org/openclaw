import { ToggleLeftIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogMedia,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import type { ChannelsStatusSnapshot } from "@/types/channels";

export function ChannelDisableDialog({
  channelId, snapshot, onConfirm, onCancel,
}: {
  channelId: string | null;
  snapshot: ChannelsStatusSnapshot | null;
  onConfirm: (channelId: string) => void;
  onCancel: () => void;
}) {
  const label = channelId
    ? (snapshot?.channelLabels?.[channelId]
      ?? snapshot?.channelMeta?.find((m) => m.id === channelId)?.label
      ?? channelId)
    : "channel";

  return (
    <AlertDialog open={channelId !== null}>
      <AlertDialogContent size="sm" onEscapeKeyDown={(e: KeyboardEvent) => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <ToggleLeftIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Disable {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will disable the channel. You can re-enable it at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            onClick={() => { if (channelId) { onConfirm(channelId); } }}
          >
            Disable
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
