import { useState } from "react";
import { Loader2Icon, PackagePlusIcon } from "lucide-react";
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
import { usePluginsStore } from "@/store/plugins.store";
import type { ChannelCatalogEntry } from "@/types/channels";

export function ChannelEnablePluginDialog({
  entry, onConfirmed, onCancel,
}: {
  entry: ChannelCatalogEntry | null;
  onConfirmed: () => void;
  onCancel: () => void;
}) {
  const enablePlugin = usePluginsStore((s) => s.enablePlugin);
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = () => {
    if (!entry?.pluginId) return;
    setConfirming(true);
    void enablePlugin(entry.pluginId, true).then(() => {
      setConfirming(false);
      onConfirmed();
    });
  };

  return (
    <AlertDialog open={entry !== null}>
      <AlertDialogContent size="sm" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <PackagePlusIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Enable {entry?.label ?? "plugin"}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will enable the plugin in your config.{" "}
            <strong>The gateway will need to restart</strong> to activate it —
            use the OpenClaw menu bar app or run{" "}
            <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">openclaw gateway run</code>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={confirming} onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={confirming} onClick={handleConfirm}>
            {confirming
              ? <><Loader2Icon className="size-3.5 animate-spin mr-1.5" />Enabling…</>
              : "Enable Plugin"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
