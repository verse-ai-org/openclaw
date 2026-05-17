/**
 * updater.ts — 自动更新模块
 *
 * 使用 electron-updater 从 Cloudflare R2 拉取更新描述文件（latest-mac.yml / latest.yml），
 * 在后台静默下载新版本，下载完成后通过 IPC 通知渲染进程，由用户决定何时重启安装。
 *
 * 更新服务器：https://files.aiverser.com/bossim/releases/
 * 配置位于 electron-builder.yml publish.url。
 */

import { autoUpdater, UpdateInfo } from "electron-updater";
import type { BrowserWindow } from "electron";
import { stopGatewayForUpdate } from "./gateway.js";
import { mainLogNote, mainLogWarn } from "./logger.js";

let _mainWindow: BrowserWindow | null = null;

function updaterLog(message: string): void {
  mainLogNote(message);
}

/**
 * 初始化自动更新。
 * 仅在 app.isPackaged 时生效，开发模式下跳过。
 *
 * @param mainWindow  主窗口引用，用于向渲染进程发送 IPC 消息
 */
export function initAutoUpdater(mainWindow: BrowserWindow): void {
  _mainWindow = mainWindow;

  // 关闭自动下载，改为手动触发，避免在用户不知情的情况下占用带宽
  autoUpdater.autoDownload = false;
  // 禁止退出时自动安装：Windows NSIS 在退出瞬间安装易删空安装目录（见 electron-builder#9181）
  autoUpdater.autoInstallOnAppQuit = false;
  // Windows NSIS 差量更新失败会导致「删旧文件后未写入新版本」
  autoUpdater.disableDifferentialDownload = true;
  // 允许预发布版本（beta/alpha）的自动推送
  // 当前版本包含预发布标签时会自动启用，也可显式设置
  autoUpdater.allowPrerelease = true;
  // 设置更新通道：使用 latest 通道，确保能找到更新文件
  autoUpdater.channel = "latest";

  autoUpdater.on("checking-for-update", () => {
    updaterLog("[updater] 检查更新中…");
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    updaterLog(`[updater] 发现新版本: ${info.version}，开始后台下载`);
    // 发现新版本后立即开始下载（后台静默）
    autoUpdater.downloadUpdate().catch((err: unknown) => {
      mainLogWarn(`[updater] 下载失败: ${String(err)}`);
    });
  });

  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    updaterLog(`[updater] 已是最新版本: ${info.version}`);
  });

  autoUpdater.on("download-progress", (progress) => {
    const pct = Math.round(progress.percent);
    // 每 20% 记录一次，避免日志过多
    if (pct % 20 === 0) {
      updaterLog(`[updater] 下载进度: ${pct}%`);
    }
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    updaterLog(`[updater] 新版本 ${info.version} 下载完成，通知渲染进程`);
    // 通知渲染进程，由 UI 展示"重启安装"提示条
    _mainWindow?.webContents.send("app:update-ready", {
      version: info.version,
      releaseNotes: info.releaseNotes ?? "",
    });
  });

  autoUpdater.on("error", (err: Error) => {
    mainLogWarn(`[updater] 更新错误: ${err.message}`);
  });

  updaterLog("[updater] autoUpdater 已初始化");
}

/**
 * 检查更新。
 * 可在 app ready 时调用一次，也可定时调用。
 * 仅在 app.isPackaged 时有实际效果（electron-updater 内部已处理 dev 模式）。
 */
export function checkForUpdates(): void {
  autoUpdater.checkForUpdates().catch((err: unknown) => {
    mainLogWarn(`[updater] checkForUpdates 异常: ${String(err)}`);
  });
}

/**
 * 停止 Gateway、释放文件锁后退出并安装已下载的新版本。
 * 由渲染进程通过 IPC（app:install-update）触发。
 */
export async function quitAndInstall(): Promise<void> {
  updaterLog("[updater] 用户确认，停止 Gateway 并安装新版本");
  await stopGatewayForUpdate();
  autoUpdater.quitAndInstall(false, true);
}
