import { Loader2Icon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGatewayStore } from "@/store/gateway.store";

/**
 * Global overlay shown while Gateway is intentionally restarting
 * (e.g. after enabling/disabling a channel or plugin).
 *
 * Visibility is driven by `useGatewayStore(s => s.restarting)`, which is
 * set to `true` by `beginRestart()` before any action that restarts the
 * Gateway, and cleared automatically by `setConnected()` once the
 * WebSocket reconnects.
 */
export function GatewayRestartingOverlay() {
  const restarting = useGatewayStore((s) => s.restarting);

  return (
    <Dialog open={restarting}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col items-center gap-4 py-10 sm:max-w-xs"
        overlayClassName="backdrop-blur-sm bg-background/80"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
        <DialogHeader className="items-center">
          <DialogTitle className="text-base">Applying changes…</DialogTitle>
          <DialogDescription>
            Gateway is reloading. This will only take a moment.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
