import { useEffect, useState } from "react";
import { Download, X, AlertTriangle } from "lucide-react";
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 仅在 Electron 环境中注册监听
    const bridge = (window as Window & { electronBridge?: {
      onUpdateReady?: (cb: (info: UpdateInfo) => void) => () => void;
      installUpdate?: () => Promise<void>;
    } }).electronBridge;

    if (!bridge?.onUpdateReady) { return; }

    const unsub = bridge.onUpdateReady((info) => {
      setUpdateInfo(info);
    });

    return unsub;
  }, []);

  if (!updateInfo) { return null; }

  const handleInstall = async () => {
    setInstalling(true);
    setError(null);
    try {
      const bridge = (window as Window & { electronBridge?: {
        installUpdate?: () => Promise<void>;
      } }).electronBridge;
      
      // 添加超时保护：5 秒后如果还没完成，认为安装失败
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Installation timed out, please retry")), 5000)
      );
      
      const installPromise = bridge?.installUpdate?.() || Promise.reject(new Error("Installation method is unavailable"));
      
      await Promise.race([installPromise, timeoutPromise]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Installation failed, please retry";
      setError(errorMsg);
      setInstalling(false);
      console.error("[UpdateBanner] Installation failed:", err);
    }
  };

  const handleDismiss = () => {
    setUpdateInfo(null);
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-2 text-sm border-b",
        error 
          ? "bg-red-50 text-red-700 border-red-200"
          : "bg-blue-50 text-blue-700 border-blue-200",
      )}
    >
      {error ? (
        <AlertTriangle className="size-4 shrink-0" />
      ) : (
        <Download className="size-4 shrink-0" />
      )}
      <span className="flex-1 truncate">
        {error ? (
          <span className="font-medium">Install failed:</span>
        ) : (
          <>
            new version <span className="font-semibold">v{updateInfo.version}</span> has been downloaded,
          </>
        )}
        {error ? error : "Restart to update."}
      </span>
      {!error && (
        <>
          <button
            onClick={handleInstall}
            disabled={installing}
            className="flex items-center gap-1 text-xs font-medium hover:underline shrink-0 disabled:opacity-60"
          >
            {installing ? "Restarting…" : "Restart and install"}
          </button>
          <button
            className="ml-1 opacity-60 hover:opacity-100 shrink-0"
            aria-label="Dismiss later"
            onClick={handleDismiss}
          >
            <X className="size-3.5" />
          </button>
        </>
      )}
      {error && (
        <button
          className="ml-1 opacity-60 hover:opacity-100 shrink-0"
          aria-label="Close error message"
          onClick={handleDismiss}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
