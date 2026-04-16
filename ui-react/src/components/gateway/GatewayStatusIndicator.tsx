import { useState } from "react";
import { ServerIcon, RefreshCw, RotateCwIcon, Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway.store";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUS_DOT: Record<
  string,
  { color: string; pulse: boolean; label: string }
> = {
  connected: { color: "bg-emerald-500", pulse: false, label: "Connected" },
  connecting: { color: "bg-amber-400", pulse: true, label: "Connecting…" },
  disconnected: { color: "bg-red-500", pulse: false, label: "Disconnected" },
  error: { color: "bg-red-500", pulse: false, label: "Error" },
};

/** Electron bridge type — only manualGatewayRestart is needed here */
interface ElectronBridge {
  manualGatewayRestart?: () => Promise<{ ok: boolean; error?: string }>;
}

function getElectronBridge(): ElectronBridge | null {
  return (window as unknown as { electronBridge?: ElectronBridge }).electronBridge ?? null;
}

export function GatewayStatusIndicator() {
  const status = useGatewayStore((s) => s.status);
  const lastError = useGatewayStore((s) => s.lastError);
  const serverVersion = useGatewayStore((s) => s.serverVersion);
  const client = useGatewayStore((s) => s.client);
  const beginRestart = useGatewayStore((s) => s.beginRestart);

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const dot = STATUS_DOT[status] ?? STATUS_DOT.disconnected;
  const bridge = getElectronBridge();
  const canManualRestart = !!bridge?.manualGatewayRestart;

  const handleRestartClick = () => {
    setPopoverOpen(false);
    setConfirmOpen(true);
  };

  const handleConfirmRestart = async () => {
    setConfirmOpen(false);
    setRestarting(true);
    // Show the global restarting overlay
    beginRestart();
    try {
      await bridge!.manualGatewayRestart!();
      // restarting overlay clears automatically when Gateway reconnects (setConnected)
    } catch {
      // restarting will clear on next setConnected; no extra handling needed
    } finally {
      setRestarting(false);
    }
  };

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={`Gateway: ${dot.label}`}
          >
            <ServerIcon className="size-4" />
            {/* Status dot — bottom-right corner of the icon */}
            <span
              className={cn(
                "absolute bottom-1 right-1 size-2 rounded-full ring-1 ring-white",
                dot.color,
                dot.pulse && "animate-pulse",
              )}
            />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          className="w-64 p-0 text-sm"
          sideOffset={8}
        >
          {/* Header */}
          <div className="flex items-center gap-2 border-b px-3 py-2.5">
            <span
              className={cn(
                "size-2 rounded-full shrink-0",
                dot.color,
                dot.pulse && "animate-pulse",
              )}
            />
            <span className="font-medium">{dot.label}</span>
            {serverVersion && (
              <span className="ml-auto text-xs text-muted-foreground">
                v{serverVersion}
              </span>
            )}
          </div>

          {/* Body */}
          <div className="px-3 py-2.5 space-y-2">
            {lastError ? (
              <p className="text-xs text-destructive break-words">{lastError}</p>
            ) : status === "connected" ? (
              <p className="text-xs text-muted-foreground">
                Gateway is running normally.
              </p>
            ) : status === "connecting" ? (
              <p className="text-xs text-muted-foreground">
                Establishing connection…
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Not connected to Gateway.
              </p>
            )}

            {(status === "disconnected" || status === "error") && (
              <button
                onClick={() => client?.start()}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <RefreshCw className="size-3" />
                Retry
              </button>
            )}

            {/* Manual restart — only shown in Electron */}
            {canManualRestart && (
              <button
                onClick={handleRestartClick}
                disabled={restarting}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
              >
                {restarting ? (
                  <Loader2Icon className="size-3 animate-spin" />
                ) : (
                  <RotateCwIcon className="size-3" />
                )}
                Restart
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Restart confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restart Gateway?</AlertDialogTitle>
            <AlertDialogDescription>
              The Gateway will restart. All active connections will be briefly
              interrupted and restored automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { void handleConfirmRestart(); }}
            >
              Restart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
