import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WeixinLoginPanel } from "@/components/channels/WeixinLoginPanel";
import { useChannelsStore } from "@/store/channels.store";
export function WeixinQrLoginDialog({
  open,
  onClose,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
}) {
  const weixinQrDataUrl = useChannelsStore((s) => s.weixinQrDataUrl);
  const weixinMessage = useChannelsStore((s) => s.weixinMessage);
  const weixinBusy = useChannelsStore((s) => s.weixinBusy);
  const weixinConnected = useChannelsStore((s) => s.weixinConnected);
  const snapshot = useChannelsStore((s) => s.snapshot);
  const weixinRaw = snapshot?.channels["openclaw-weixin"] as
    | { configured?: boolean; running?: boolean }
    | undefined;
  const alreadyLinked = Boolean(weixinRaw?.configured);
  const weixinNeedsVerifyCode = useChannelsStore((s) => s.weixinNeedsVerifyCode);
  const weixinVerifyCode = useChannelsStore((s) => s.weixinVerifyCode);
  const startWeixinLogin = useChannelsStore((s) => s.startWeixinLogin);
  const waitForWeixinWebLoginProvider = useChannelsStore((s) => s.waitForWeixinWebLoginProvider);
  const waitForWeixinScan = useChannelsStore((s) => s.waitForWeixinScan);
  const logoutWeixin = useChannelsStore((s) => s.logoutWeixin);
  const connected = weixinConnected || alreadyLinked;
  const connectedNotifiedRef = useRef(false);
  const loginStartedRef = useRef(false);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    if (!open) {
      connectedNotifiedRef.current = false;
      loginStartedRef.current = false;
      setPreparing(false);
      return;
    }
    if (loginStartedRef.current) {
      return;
    }
    loginStartedRef.current = true;
    void (async () => {
      if (alreadyLinked) {
        useChannelsStore.setState({
          weixinMessage:
            weixinRaw?.running === true
              ? "此微信账号已连接且通道正在运行，无需重复扫码。"
              : "此微信账号已保存凭证，无需重复扫码。可在通道详情中查看状态。",
          weixinQrDataUrl: null,
          weixinConnected: true,
        });
        return;
      }
      setPreparing(true);
      try {
        const ready = await waitForWeixinWebLoginProvider();
        if (!ready.ok) {
          useChannelsStore.setState({ weixinMessage: ready.reason ?? null });
          loginStartedRef.current = false;
          return;
        }
        await startWeixinLogin(false);
      } finally {
        setPreparing(false);
      }
    })();
  }, [open, startWeixinLogin, waitForWeixinWebLoginProvider, alreadyLinked, weixinRaw?.running]);

  // Close only after a fresh QR login succeeds — not when the channel was already configured.
  useEffect(() => {
    if (!open || !weixinConnected || connectedNotifiedRef.current) {
      return;
    }
    connectedNotifiedRef.current = true;
    onConnected();
  }, [open, weixinConnected, onConnected]);

  const handleClose = () => {
    useChannelsStore.setState({
      weixinQrDataUrl: null,
      weixinMessage: null,
      weixinSessionKey: null,
      weixinBusy: false,
      weixinNeedsVerifyCode: false,
      weixinVerifyCode: "",
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent
        className="w-[420px] max-w-[90vw] rounded-2xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="gap-2">
          <DialogTitle className="text-lg">
            {alreadyLinked ? "Weixin — already connected" : "Weixin — scan to connect"}
          </DialogTitle>
          <DialogDescription>
            {alreadyLinked
              ? "This OpenClaw gateway already has a linked Weixin account. You can close this dialog."
              : "Scan the QR code with WeChat to link this OpenClaw to your Weixin bot."}
          </DialogDescription>
        </DialogHeader>
        <WeixinLoginPanel
          qrDataUrl={weixinQrDataUrl}
          message={weixinMessage}
          busy={weixinBusy}
          connected={connected}
          preparing={preparing}
          showStartButton={false}
          needsVerifyCode={weixinNeedsVerifyCode}
          verifyCode={weixinVerifyCode}
          onVerifyCodeChange={(value) => useChannelsStore.setState({ weixinVerifyCode: value })}
          onStart={() => void startWeixinLogin(true)}
          onWait={() => void waitForWeixinScan()}
          onLogout={() => void logoutWeixin()}
        />
      </DialogContent>
    </Dialog>
  );
}
