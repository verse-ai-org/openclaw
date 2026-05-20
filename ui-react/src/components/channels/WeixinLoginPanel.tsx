import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2Icon, QrCodeIcon, CheckCircle2Icon } from "lucide-react";

const QR_SLOT_CLASS =
  "flex size-48 items-center justify-center rounded-lg border bg-white p-2";

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
      <div className={`${QR_SLOT_CLASS} flex-col gap-2`}>
        <p className="text-xs text-destructive text-center">生成二维码失败</p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-blue-500 underline break-all max-w-[200px] text-center"
        >
          点击打开二维码链接
        </a>
      </div>
    );
  }

  return (
    <div className={QR_SLOT_CLASS}>
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}

function QrLoadingSlot({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={QR_SLOT_CLASS}>
        <Loader2Icon className="size-8 animate-spin text-muted-foreground" aria-hidden />
      </div>
      <p className="text-xs text-muted-foreground text-center max-w-[240px]">{label}</p>
    </div>
  );
}

function qrStatusCaption(message: string | null, loadingQr: boolean): string {
  const trimmed = message?.trim();
  if (trimmed) {
    return trimmed;
  }
  if (loadingQr) {
    return "正在生成二维码…";
  }
  return "使用微信扫描二维码完成连接 / Scan with WeChat to connect";
}

interface WeixinLoginPanelProps {
  qrDataUrl: string | null;
  message: string | null;
  busy: boolean;
  connected: boolean;
  needsVerifyCode: boolean;
  verifyCode: string;
  /** Gateway plugin readiness / QR fetch before first image. */
  preparing?: boolean;
  /** Hide manual start; dialog auto-starts login on open. */
  showStartButton?: boolean;
  onVerifyCodeChange: (value: string) => void;
  onStart: () => void;
  onWait: () => void;
  onLogout: () => void;
}

export function WeixinLoginPanel({
  qrDataUrl,
  message,
  busy,
  connected,
  needsVerifyCode,
  verifyCode,
  preparing = false,
  showStartButton = true,
  onVerifyCodeChange,
  onStart,
  onWait,
  onLogout,
}: WeixinLoginPanelProps) {
  const loadingQr = (busy || preparing) && !qrDataUrl && !needsVerifyCode;
  const showQrZone =
    !connected || Boolean(qrDataUrl) || loadingQr || needsVerifyCode;

  const qrCaption = qrStatusCaption(message, loadingQr);
  const statusInQrZone = loadingQr || Boolean(qrDataUrl);
  const showRetry = !showStartButton && !busy && !preparing && !qrDataUrl && !connected;

  return (
    <div className="mt-4 border rounded-lg p-4 bg-muted/20 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        微信登录 / WeChat Login
      </p>

      {connected && !qrDataUrl && !loadingQr && (
        <div className="flex items-center gap-2 text-emerald-600">
          <CheckCircle2Icon className="size-4" />
          <span className="text-xs font-medium">已连接 / Connected</span>
        </div>
      )}

      {showQrZone && !connected && (
        <div className="flex flex-col items-center gap-2">
          {loadingQr ? (
            <QrLoadingSlot
              label={
                preparing
                  ? "正在连接网关…"
                  : message?.trim() || "正在生成二维码…"
              }
            />
          ) : qrDataUrl ? (
            <>
              <QRCanvas url={qrDataUrl} />
              <p className="text-xs text-muted-foreground text-center max-w-[240px]">
                {qrCaption}
              </p>
            </>
          ) : null}
        </div>
      )}

      {needsVerifyCode && (
        <div className="flex flex-col gap-2 w-full max-w-[240px] mx-auto">
          <p className="text-xs text-muted-foreground text-center">
            手机微信会显示配对数字，请输入后继续
          </p>
          <Input
            value={verifyCode}
            onChange={(event) => onVerifyCodeChange(event.target.value)}
            placeholder="配对数字"
            className="h-8 text-center text-sm tracking-widest"
            inputMode="numeric"
            autoComplete="one-time-code"
          />
          <Button
            size="sm"
            disabled={busy || !verifyCode.trim()}
            onClick={onWait}
            className="h-7 text-xs"
          >
            {busy ? (
              <>
                <Loader2Icon className="size-3 mr-1 animate-spin" />
                验证中…
              </>
            ) : (
              "提交配对码 / Submit code"
            )}
          </Button>
        </div>
      )}

      {message && !statusInQrZone && (
        <p className="text-xs text-muted-foreground bg-muted rounded px-2 py-1">{message}</p>
      )}

      {(showStartButton || showRetry) && (
        <div className="flex flex-wrap gap-2">
          {showStartButton && !busy && !preparing && (
            <Button
              size="sm"
              variant="outline"
              onClick={onStart}
              className="h-7 text-xs"
            >
              <QrCodeIcon className="size-3 mr-1" />
              {qrDataUrl ? "刷新二维码" : "扫码登录"}
            </Button>
          )}
          {showRetry && (
            <Button size="sm" variant="outline" onClick={onStart} className="h-7 text-xs">
              重试 / Retry
            </Button>
          )}
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
      )}

      {connected && !showStartButton && !showRetry && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={onLogout}
            className="h-7 text-xs"
          >
            Logout
          </Button>
        </div>
      )}
    </div>
  );
}
