import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface UpdateInfo {
  version: string;
  releaseNotes: string;
}

/**
 * UpdateBanner — 自动更新提示条
 *
 * 仅在 Electron 环境中生效。当主进程通过 IPC 通知新版本已下载完成后，
 * 顶部出现提示条，用户点击「重启安装」后调用 electron-updater 的 quitAndInstall。
 */
export function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // 仅在 Electron 环境中注册监听
    const bridge = (window as Window & { electronBridge?: {
      onUpdateReady?: (cb: (info: UpdateInfo) => void) => () => void;
      installUpdate?: () => Promise<void>;
    } }).electronBridge;

    if (!bridge?.onUpdateReady) return;

    const unsub = bridge.onUpdateReady((info) => {
      setUpdateInfo(info);
    });

    return unsub;
  }, []);

  if (!updateInfo) return null;

  const handleInstall = async () => {
    setInstalling(true);
    try {
      const bridge = (window as Window & { electronBridge?: {
        installUpdate?: () => Promise<void>;
      } }).electronBridge;
      await bridge?.installUpdate?.();
    } catch {
      // quitAndInstall 会直接退出 app，catch 通常不会触发
      setInstalling(false);
    }
  };

  const handleDismiss = () => {
    setUpdateInfo(null);
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-2 text-sm",
        "bg-blue-50 text-blue-700 border-b border-blue-200",
      )}
    >
      <Download className="size-4 shrink-0" />
      <span className="flex-1 truncate">
        新版本 <span className="font-semibold">v{updateInfo.version}</span> 已下载完成，重启即可更新。
      </span>
      <button
        onClick={handleInstall}
        disabled={installing}
        className="flex items-center gap-1 text-xs font-medium hover:underline shrink-0 disabled:opacity-60"
      >
        {installing ? "正在重启…" : "重启安装"}
      </button>
      <button
        className="ml-1 opacity-60 hover:opacity-100 shrink-0"
        aria-label="稍后提示"
        onClick={handleDismiss}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
