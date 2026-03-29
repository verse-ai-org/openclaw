import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Loader2Icon, QrCodeIcon, CheckCircle2Icon } from "lucide-react";

function QRCanvas({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !url) return;
    setError(null);
    QRCode.toCanvas(canvasRef.current, url, {
      width: 192,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch((err: unknown) => {
      setError(String(err));
    });
  }, [url]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-1">
        <p className="text-xs text-destructive">生成二维码失败</p>
        <a href={url} target="_blank" rel="noreferrer"
          className="text-xs text-blue-500 underline break-all max-w-[240px] text-center">
          点击打开二维码链接
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white p-2">
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}

interface WeixinLoginPanelProps {
  qrDataUrl: string | null;
  message: string | null;
  busy: boolean;
  connected: boolean;
  onStart: () => void;
  onWait: () => void;
  onLogout: () => void;
}

export function WeixinLoginPanel({
  qrDataUrl,
  message,
  busy,
  connected,
  onStart,
  onWait,
  onLogout,
}: WeixinLoginPanelProps) {
  // Auto-start waiting as soon as QR code appears
  const waitTriggeredRef = useRef<string | null>(null);
  useEffect(() => {
    if (qrDataUrl && qrDataUrl !== waitTriggeredRef.current && !busy) {
      waitTriggeredRef.current = qrDataUrl;
      onWait();
    }
  }, [qrDataUrl, busy, onWait]);
  return (
    <div className="mt-4 border rounded-lg p-4 bg-muted/20 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        微信登录 / WeChat Login
      </p>

      {connected && !qrDataUrl && (
        <div className="flex items-center gap-2 text-emerald-600">
          <CheckCircle2Icon className="size-4" />
          <span className="text-xs font-medium">已连接 / Connected</span>
        </div>
      )}

      {qrDataUrl && (
        <div className="flex flex-col items-center gap-2">
          <QRCanvas url={qrDataUrl} />
          <p className="text-xs text-muted-foreground text-center max-w-[240px]">
            使用微信扫描二维码完成连接 / Scan with WeChat to connect
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
                等待扫码…
              </>
            ) : (
              "等待扫码 / Wait for scan"
            )}
          </Button>
        </div>
      )}

      {message && (
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
          {busy && !qrDataUrl ? (
            <>
              <Loader2Icon className="size-3 mr-1 animate-spin" />
              生成中…
            </>
          ) : (
            <>
              <QrCodeIcon className="size-3 mr-1" />
              {qrDataUrl ? "刷新二维码" : "扫码登录"}
            </>
          )}
        </Button>

        {connected && (
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={onLogout}
            className="h-7 text-xs"
          >
            Logout
          </Button>
        )}
      </div>
    </div>
  );
}
