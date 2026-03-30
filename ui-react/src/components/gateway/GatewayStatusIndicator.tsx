import { ServerIcon, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway.store";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const STATUS_DOT: Record<
  string,
  { color: string; pulse: boolean; label: string }
> = {
  connected: { color: "bg-emerald-500", pulse: false, label: "Connected" },
  connecting: { color: "bg-amber-400", pulse: true, label: "Connecting…" },
  disconnected: { color: "bg-red-500", pulse: false, label: "Disconnected" },
  error: { color: "bg-red-500", pulse: false, label: "Error" },
};

export function GatewayStatusIndicator() {
  const status = useGatewayStore((s) => s.status);
  const lastError = useGatewayStore((s) => s.lastError);
  const serverVersion = useGatewayStore((s) => s.serverVersion);
  const client = useGatewayStore((s) => s.client);

  const dot = STATUS_DOT[status] ?? STATUS_DOT.disconnected;

  return (
    <Popover>
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
        </div>
      </PopoverContent>
    </Popover>
  );
}
