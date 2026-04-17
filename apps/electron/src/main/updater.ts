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

let _mainWindow: BrowserWindow | null = null;
let _log: (msg: string) => void = console.log;

/**
 * 初始化自动更新。
 * 仅在 app.isPackaged 时生效，开发模式下跳过。
 *
 * @param mainWindow  主窗口引用，用于向渲染进程发送 IPC 消息
 * @param log         日志函数，与主进程 mlog 保持一致
 */
export function initAutoUpdater(
  mainWindow: BrowserWindow,
  log: (msg: string) => void,
): void {
  _mainWindow = mainWindow;
  _log = log;

  // 关闭自动下载，改为手动触发，避免在用户不知情的情况下占用带宽
  autoUpdater.autoDownload = false;
  // 下载完成后不自动安装，等待用户确认
  autoUpdater.autoInstallOnAppQuit = true;
  // 允许预发布版本（beta/alpha）的自动推送
  // 当前版本包含预发布标签时会自动启用，也可显式设置
  autoUpdater.allowPrerelease = true;
  // 设置更新通道：使用 latest 通道，确保能找到更新文件
  autoUpdater.channel = "latest";

  autoUpdater.on("checking-for-update", () => {
    _log("[updater] 检查更新中…");
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    _log(`[updater] 发现新版本: ${info.version}，开始后台下载`);
    // 发现新版本后立即开始下载（后台静默）
    autoUpdater.downloadUpdate().catch((err: unknown) => {
      _log(`[updater] 下载失败: ${String(err)}`);
    });
  });

  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    _log(`[updater] 已是最新版本: ${info.version}`);
  });

  autoUpdater.on("download-progress", (progress) => {
    const pct = Math.round(progress.percent);
    // 每 20% 记录一次，避免日志过多
    if (pct % 20 === 0) {
      _log(`[updater] 下载进度: ${pct}%`);
    }
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    _log(`[updater] 新版本 ${info.version} 下载完成，通知渲染进程`);
    // 通知渲染进程，由 UI 展示"重启安装"提示条
    _mainWindow?.webContents.send("app:update-ready", {
      version: info.version,
      releaseNotes: info.releaseNotes ?? "",
    });
  });

  autoUpdater.on("error", (err: Error) => {
    _log(`[updater] 更新错误: ${err.message}`);
  });

  _log("[updater] autoUpdater 已初始化");
}

/**
 * 检查更新。
 * 可在 app ready 时调用一次，也可定时调用。
 * 仅在 app.isPackaged 时有实际效果（electron-updater 内部已处理 dev 模式）。
 */
export function checkForUpdates(): void {
  autoUpdater.checkForUpdates().catch((err: unknown) => {
    _log(`[updater] checkForUpdates 异常: ${String(err)}`);
  });
}

/**
 * 退出并安装已下载的新版本。
 * 由渲染进程通过 IPC（app:install-update）触发。
 */
export function quitAndInstall(): void {
  _log("[updater] 用户确认，退出并安装新版本");
  autoUpdater.quitAndInstall(false, true);
}
