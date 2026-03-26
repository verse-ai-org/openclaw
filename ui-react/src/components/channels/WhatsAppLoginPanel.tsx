import { Button } from "@/components/ui/button";
import { Loader2Icon, QrCodeIcon } from "lucide-react";

interface WhatsAppLoginPanelProps {
  qrDataUrl: string | null;
  message: string | null;
  busy: boolean;
  linked: boolean;
  onStart: () => void;
  onWait: () => void;
  onLogout: () => void;
}

export function WhatsAppLoginPanel({
  qrDataUrl,
  message,
  busy,
  linked,
  onStart,
  onWait,
  onLogout,
}: WhatsAppLoginPanelProps) {
  return (
    <div className="mt-4 border rounded-lg p-4 bg-muted/20 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        WhatsApp Login
      </p>

      {qrDataUrl && (
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-lg border bg-white p-2">
            <img src={qrDataUrl} alt="WhatsApp QR" className="size-40 object-contain" />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Scan with WhatsApp → Linked Devices → Link a Device
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onWait}
            className="h-7 text-xs"
          >
            {busy ? (
              <>
                <Loader2Icon className="size-3 mr-1 animate-spin" />
                Waiting…
              </>
            ) : (
              "Wait for scan"
            )}
          </Button>
        </div>
      )}

      {message && !qrDataUrl && (
        <p className="text-xs text-muted-foreground bg-muted rounded px-2 py-1">{message}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={onStart}
          className="h-7 text-xs"
        >
          {busy ? (
            <>
              <Loader2Icon className="size-3 mr-1 animate-spin" />
              Starting…
            </>
          ) : (
            <>
              <QrCodeIcon className="size-3 mr-1" />
              {qrDataUrl ? "Refresh QR" : "Show QR"}
            </>
          )}
        </Button>

        {linked && (
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={onLogout}
            className="h-7 text-xs"
          >
            Logout WhatsApp
          </Button>
        )}
      </div>
    </div>
  );
}
