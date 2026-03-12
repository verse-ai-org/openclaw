import { AlertCircle, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway.store";

export function ConnectionBanner() {
  const status = useGatewayStore((s) => s.status);
  const lastError = useGatewayStore((s) => s.lastError);
  const client = useGatewayStore((s) => s.client);
  const connect = () => client?.start();

  if (status === "connected" || status === "connecting") {
    return null;
  }
  if (!lastError) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-2 text-sm",
        "bg-destructive/10 text-destructive border-b border-destructive/20",
      )}
    >
      <AlertCircle className="size-4 shrink-0" />
      <span className="flex-1 truncate">{lastError}</span>
      <button
        onClick={connect}
        className="flex items-center gap-1 text-xs hover:underline shrink-0"
        aria-label="Retry connection"
      >
        <RefreshCw className="size-3" />
        Retry
      </button>
      <button
        className="ml-1 opacity-60 hover:opacity-100 shrink-0"
        aria-label="Dismiss"
        onClick={() => useGatewayStore.setState({ lastError: null })}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
