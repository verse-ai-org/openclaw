import { useState } from "react";
import { Loader2Icon, PackagePlusIcon, ToggleLeftIcon, ToggleRightIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export type ChannelActionVariant =
  | { kind: "enable-channel"; channelId: string; label: string }
  | { kind: "disable-channel"; channelId: string; label: string }
  | { kind: "enable-plugin"; pluginId: string; label: string };

/**
 * Unified confirmation dialog for all channel-related actions:
 * - enable/disable a channel (ChannelToggleDialog)
 * - enable a plugin that provides a channel (ChannelEnablePluginDialog)
 */
export function ChannelActionDialog({
  action,
  onConfirm,
  onCancel,
}: {
  action: ChannelActionVariant | null;
  onConfirm: (action: ChannelActionVariant) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    if (!action) return;
    setConfirming(true);
    try {
      await onConfirm(action);
    } finally {
      setConfirming(false);
    }
  };

  const icon = action?.kind === "enable-plugin"
    ? <PackagePlusIcon />
    : action?.kind === "enable-channel"
    ? <ToggleRightIcon />
    : <ToggleLeftIcon />;

  const title = !action ? "" :
    action.kind === "enable-plugin" ? `Enable ${action.label}?` :
    action.kind === "enable-channel" ? `Enable ${action.label}?` :
    `Disable ${action.label}?`;

  const description = action?.kind === "disable-channel"
      ? "This will disable the channel. You can re-enable it at any time."
      : "This will enable the channel. You may need to restart the gateway for changes to take effect."

  const confirmLabel = !action ? "" :
    action.kind === "enable-plugin" ? "Enable" :
    action.kind === "enable-channel" ? "Enable" :
    "Disable";

  const confirmClass = !action ? "" :
    action.kind === "disable-channel"
      ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
      : "bg-emerald-600 hover:bg-emerald-700 text-white";

  return (
    <AlertDialog open={action !== null}>
      <AlertDialogContent size="sm" onEscapeKeyDown={(e: KeyboardEvent) => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogMedia>{icon}</AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={confirming}
            onClick={onCancel}
            className="rounded-full"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn("rounded-full", confirmClass)}
            disabled={confirming}
            onClick={() => { void handleConfirm(); }}
          >
            {confirming
              ? <><Loader2Icon className="size-3.5 animate-spin mr-1.5" />Confirming…</>
              : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
