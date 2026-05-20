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
import { channelActionUsesWeixinQrLogin } from "@/lib/channel-post-enable";

export type ChannelActionVariant =
  | { kind: "enable-channel"; channelId: string; label: string }
  | { kind: "disable-channel"; channelId: string; label: string }
  | { kind: "enable-plugin"; pluginId: string; label: string }
  | { kind: "install-channel"; channelId: string; label: string; npmSpec: string };

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

  const icon =
    action?.kind === "install-channel" || action?.kind === "enable-plugin" ? (
      <PackagePlusIcon />
    ) : action?.kind === "enable-channel" ? (
      <ToggleRightIcon />
    ) : (
      <ToggleLeftIcon />
    );

  const title = !action
    ? ""
    : action.kind === "install-channel"
      ? `Install ${action.label}?`
      : action.kind === "enable-plugin"
        ? `Enable ${action.label}?`
        : action.kind === "enable-channel"
          ? `Enable ${action.label}?`
          : `Disable ${action.label}?`;

  const weixinQrAfterEnable = action ? channelActionUsesWeixinQrLogin(action) : false;

  const description =
    action?.kind === "disable-channel"
      ? "This turns off the channel in config. The plugin may stay installed; you can enable it again later."
      : action?.kind === "install-channel"
        ? weixinQrAfterEnable
          ? `Installs ${action.npmSpec}, enables Weixin, and applies config. The gateway may restart; after reconnect, a QR login dialog opens.`
          : `Installs ${action.npmSpec}, enables the channel, and applies config. The gateway may reload.`
        : action?.kind === "enable-plugin"
          ? weixinQrAfterEnable
            ? "This enables the Weixin plugin and may restart the gateway. After reconnect, scan the WeChat QR code to finish setup."
            : "This enables the plugin, applies config, and may briefly disconnect the control UI while the gateway reloads."
          : weixinQrAfterEnable
            ? "This enables Weixin in config. The gateway may restart once to load the plugin. After reconnect, a QR login dialog opens — scan with WeChat to connect."
            : "This enables the channel in config. The gateway may restart once to load the plugin (for example Feishu). After it reconnects, the setup screen opens for credentials.";

  const confirmLabel = !action
    ? ""
    : action.kind === "install-channel"
      ? "Install"
      : action.kind === "enable-plugin"
        ? "Enable"
        : action.kind === "enable-channel"
          ? "Enable"
          : "Disable";

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
