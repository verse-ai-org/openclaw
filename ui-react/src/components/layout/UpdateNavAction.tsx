import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface UpdateInfo {
  version: string;
  releaseNotes: string;
}

/**
 * Top-nav inline control when an Electron update is downloaded and ready.
 * No popover: primary action is a single "Update & relaunch" button.
 */
export function UpdateNavAction() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bridge = (
      window as Window & {
        electronBridge?: {
          onUpdateReady?: (cb: (info: UpdateInfo) => void) => () => void;
          installUpdate?: () => Promise<void>;
        };
      }
    ).electronBridge;

    if (!bridge?.onUpdateReady) {
      return;
    }

    return bridge.onUpdateReady((info) => {
      setUpdateInfo(info);
      setError(null);
    });
  }, []);

  if (!updateInfo) {
    return null;
  }

  const handleInstall = () => {
    setInstalling(true);
    setError(null);
    const bridge = (
      window as Window & {
        electronBridge?: { installUpdate?: () => Promise<void> };
      }
    ).electronBridge;

    const installPromise =
      bridge?.installUpdate?.() ??
      Promise.reject(new Error("Installation method is unavailable"));

    // installUpdate 成功时会退出应用，IPC 通常不会 resolve；勿用短超时误判失败
    void installPromise.catch((err: unknown) => {
      const errorMsg =
        err instanceof Error ? err.message : "Installation failed, please retry";
      setError(errorMsg);
      setInstalling(false);
      console.error("[UpdateNavAction] Installation failed:", err);
    });
  };

  return (
    <div className="flex items-center gap-1 shrink-0">
      {error ? (
        <>
          <span
            className="max-w-[120px] sm:max-w-[180px] truncate text-xs text-destructive"
            title={error}
          >
            {error}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-xs rounded-full"
            disabled={installing}
            onClick={handleInstall}
          >
            {installing ? "Restarting…" : "Retry"}
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-6 text-xs rounded-full bg-green-700 hover:bg-green-600 text-white"
          disabled={installing}
          title={`Version ${updateInfo.version}`}
          aria-label={`Update to version ${updateInfo.version} and relaunch`}
          onClick={handleInstall}
        >
          {installing ? "Restarting…" : "Update"}
        </Button>
      )}
    </div>
  );
}
