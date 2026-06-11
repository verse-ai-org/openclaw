import "./load-dev-env.js";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import {
  stopGateway,
  restartGateway,
  getGatewayToken,
  getGatewayPort,
  readExistingGatewayToken,
} from "./gateway/index.js";
import {
  isFirstLaunch,
  saveOnboardingConfig,
  writeDebugLog,
  type OnboardingConfig,
} from "./onboarding.js";
import { mainLogError, mainLogInfo, mainLogNote, mainLogWarn } from "./logger.js";
import { validateApiKey, validateInviteCode } from "./onboarding-validate.js";
import {
  oauthStart,
  oauthPoll,
  clearOAuthSession,
  handleOAuthProtocolCallback,
} from "./onboarding-oauth.js";
import {
  authStart,
  authPoll,
  authCancel,
  authGetSession,
  authLogout,
  handleAuthProtocolCallback,
  subscribeAuthSessionChanged,
  getAuthSessionChangedChannel,
} from "./bossim-auth.js";
import { generateToken } from "./token.js";
import {
  createWindow,
  configureSession,
  loadRendererPage,
  loadSplashPage,
  startStaticServer,
} from "./window.js";
import { registerWizardIpc, unregisterWizardIpc } from "./ipc-wizard.js";
import { approvePendingControlUiDevicePairing, approveDevicePairingByRequestId } from "./device-pairing.js";
import { mergeElectronControlUiAllowedOrigins } from "./control-ui-origins.js";
import { initAutoUpdater, checkForUpdates, quitAndInstall } from "./updater.js";
import {
  runStartupPipeline,
  registerStartupIpc,
  resolveDevStaticServerPort,
  shouldUseBootSplash,
  isGatewayHealthy,
  waitForSplashReady,
  DEFAULT_GATEWAY_PORT,
  type StartupPipelineContext,
} from "./startup.js";
import { copyStagingFileToPath, deleteStagingFile } from "./staging-fs.js";

// Menu bar label + “About …” title use app.getName(), which otherwise comes from
// package.json `name` (openclaw-electron). Keep in sync with electron-builder.yml `productName`.
app.setName("Bossim");

// Windows: taskbar / Start menu grouping use App User Model ID; must match electron-builder.yml `appId`
// and be set before the app "ready" event (Electron docs).
if (process.platform === "win32") {
  app.setAppUserModelId("com.verse.bossim");
}

// ─── Single-instance lock (required for Windows second-instance protocol) ─────
// Must be called before app.whenReady().
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  // process.exit() is intentionally omitted; app.quit() is sufficient.
}

// ─── URL Scheme registration ──────────────────────────────────────────────────
// In development (process.defaultApp), pass execPath + argv[1] so Electron
// itself is registered as the handler, not the built app.
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    const execArg = path.resolve(process.argv[1]);
    app.setAsDefaultProtocolClient("openclaw", process.execPath, [execArg]);
    app.setAsDefaultProtocolClient("bossim", process.execPath, [execArg]);
  }
} else {
  app.setAsDefaultProtocolClient("openclaw");
  app.setAsDefaultProtocolClient("bossim");
}

/** Shared handler for OAuth Protocol callbacks (macOS open-url + Windows second-instance) */
function dispatchOAuthCallback(url: string): void {
  if (url.startsWith("openclaw://oauth/")) {
    mlog(`[main] OAuth protocol callback: ${url}`);
    handleOAuthProtocolCallback(url);
  }
}

function dispatchBossimAuthCallback(url: string): void {
  if (url.startsWith("bossim://auth/")) {
    mlog(`[main] Bossim auth protocol callback: ${url}`);
    void handleAuthProtocolCallback(url);
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  }
}

function dispatchProtocolUrl(url: string): void {
  dispatchOAuthCallback(url);
  dispatchBossimAuthCallback(url);
}

// macOS / Linux: URL Scheme callback arrives via open-url event
app.on("open-url", (event, url) => {
  event.preventDefault();
  dispatchProtocolUrl(url);
});

// Windows: second app instance receives the URL in argv
app.on("second-instance", (_event, argv) => {
  // The protocol URL is typically the last argument when launched via URL Scheme
  const url = argv.find((arg) => arg.startsWith("openclaw://") || arg.startsWith("bossim://"));
  if (url) {
    dispatchProtocolUrl(url);
  }
  // Bring existing window to foreground
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

function mlog(msg: string): void {
  mainLogInfo(msg);
}
function mlogError(msg: string, err?: unknown): void {
  mainLogError(msg, err);
}
function mlogWarn(msg: string): void {
  mainLogWarn(msg);
}
function mlogNote(msg: string): void {
  mainLogNote(msg);
}

let mainWindow: BrowserWindow | null = null;
let staticServerPort = 0;
let sessionTokenForStartup = "";

function buildStartupContext(setupPreloaded: boolean): StartupPipelineContext | null {
  if (!mainWindow) {
    return null;
  }
  return {
    mainWindow,
    sessionToken: sessionTokenForStartup,
    staticServerPort,
    useBootSplash: shouldUseBootSplash(),
    setupPreloaded,
    patchConfigForElectron,
    registerWizardIpc,
    log: mlog,
    logError: mlogError,
  };
}

// macOS：点击 Dock 图标时，若窗口已关闭则重新创建
app.on("activate", () => {
  void (async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      mainWindow.show();
      const port = getGatewayPort();
      const token = getGatewayToken();
      if (await isGatewayHealthy(port)) {
        configureSession(port);
        if (isFirstLaunch()) {
          registerWizardIpc(port, token);
          loadRendererPage(mainWindow, "setup", {
            port,
            token,
            windowAlreadyVisible: true,
          });
        } else {
          loadRendererPage(mainWindow, "index", {
            port,
            token,
            windowAlreadyVisible: true,
          });
        }
        return;
      }
      if (shouldUseBootSplash()) {
        loadSplashPage(mainWindow);
        await waitForSplashReady(mainWindow);
      } else if (isFirstLaunch()) {
        loadRendererPage(mainWindow, "setup", {
          port: DEFAULT_GATEWAY_PORT,
          token: getGatewayToken() || sessionTokenForStartup,
          windowAlreadyVisible: true,
        });
      }
      const ctx = buildStartupContext(isFirstLaunch());
      if (ctx) {
        void runStartupPipeline(ctx);
      }
    } else {
      mainWindow?.show();
    }
  })();
});

registerStartupIpc(() => buildStartupContext(isFirstLaunch()));

// 非 macOS：所有窗口关闭时退出
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// 应用退出前停止 Gateway
app.on("before-quit", () => {
  stopGateway();
});

// IPC：渲染进程请求重启 Gateway（Onboarding 完成后调用）
ipcMain.handle("gateway:restart", async () => {
  try {
    // Wizard 完成后 openclaw.json 已写入新 token，需从磁盘读取以保持同步。
    // 若读取失败（文件不存在等），退化为使用内存缓存的 token。
    const freshToken = readExistingGatewayToken() || getGatewayToken();
    await restartGateway({ token: freshToken });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// IPC：渲染进程手动重启 Gateway（用户从 UI 主动触发）
ipcMain.handle("gateway:manual-restart", async () => {
  try {
    const token = readExistingGatewayToken() || getGatewayToken();
    await restartGateway({ token });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// IPC：渲染进程获取当前 Gateway 连接信息
ipcMain.handle("gateway:info", () => {
  const port = getGatewayPort();
  return {
    port,
    token: getGatewayToken(),
    wsUrl: `ws://127.0.0.1:${port}`,
  };
});

function isSafeAbsolutePath(filePath: string): boolean {
  const trimmed = filePath.trim();
  return trimmed.length > 0 && path.isAbsolute(trimmed);
}

ipcMain.handle("shell:showItemInFolder", async (_, filePath: unknown) => {
  if (typeof filePath !== "string" || !isSafeAbsolutePath(filePath)) {
    return { ok: false };
  }
  try {
    shell.showItemInFolder(filePath);
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle("shell:openPath", async (_, filePath: unknown) => {
  if (typeof filePath !== "string" || !isSafeAbsolutePath(filePath)) {
    return { ok: false };
  }
  try {
    const error = await shell.openPath(filePath);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle(
  "fs:copyStagingToPath",
  async (_, params: unknown): Promise<{ ok: boolean; error?: string }> => {
    if (!params || typeof params !== "object") {
      return { ok: false, error: "invalid params" };
    }
    const source = (params as { source?: unknown }).source;
    const dest = (params as { dest?: unknown }).dest;
    if (typeof source !== "string" || typeof dest !== "string") {
      return { ok: false, error: "source and dest required" };
    }
    return copyStagingFileToPath({ source, dest });
  },
);

ipcMain.handle(
  "fs:deleteStagingPath",
  async (_, filePath: unknown): Promise<{ ok: boolean; error?: string }> => {
    if (typeof filePath !== "string") {
      return { ok: false, error: "path required" };
    }
    return deleteStagingFile(filePath);
  },
);

ipcMain.handle(
  "fs:saveStagingCopyAs",
  async (
    event,
    params: unknown,
  ): Promise<{ ok: boolean; error?: string; savedPath?: string }> => {
    if (!params || typeof params !== "object") {
      return { ok: false, error: "invalid params" };
    }
    const source = (params as { source?: unknown }).source;
    const defaultName = (params as { defaultName?: unknown }).defaultName;
    if (typeof source !== "string") {
      return { ok: false, error: "source required" };
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    const saveOptions = {
      defaultPath: typeof defaultName === "string" && defaultName.trim() ? defaultName.trim() : undefined,
    };
    const result = win
      ? await dialog.showSaveDialog(win, saveOptions)
      : await dialog.showSaveDialog(saveOptions);
    if (result.canceled || !result.filePath) {
      return { ok: false, error: "cancelled" };
    }
    const copied = await copyStagingFileToPath({ source, dest: result.filePath });
    return copied.ok ? { ok: true, savedPath: result.filePath } : copied;
  },
);

// IPC：Electron 渲染进程请求主进程批准设备配对（loopback 桌面场景）
ipcMain.handle("gateway:approveDevicePairing", async (_, requestId?: string) => {
  const port = getGatewayPort();
  const token = readExistingGatewayToken() || getGatewayToken();
  const trimmed = typeof requestId === "string" ? requestId.trim() : "";
  try {
    const ok = trimmed
      ? await approveDevicePairingByRequestId({ port, token, requestId: trimmed })
      : await approvePendingControlUiDevicePairing({ port, token });
    return { ok };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// IPC：渲染进程写调试日志到 ~/.openclaw/electron-onboarding.log
ipcMain.handle("onboarding:writeDebugLog", async (_, message: string) => {
  await writeDebugLog(`[renderer] ${message}`);
});

// IPC：Onboarding 保存配置（wizard 完成后，notifyOnboardingComplete 之前调用）
ipcMain.handle("onboarding:saveConfig", async (_, cfg: OnboardingConfig) => {
  await writeDebugLog(
    `[main] saveOnboardingConfig called: ${JSON.stringify(cfg).slice(0, 200)}`,
  );
  try {
    const gatewayToken =
      cfg.gatewayToken?.trim() ||
      readExistingGatewayToken() ||
      getGatewayToken() ||
      sessionTokenForStartup;
    await saveOnboardingConfig({ ...cfg, gatewayToken });
    await writeDebugLog("[main] saveOnboardingConfig: success");
    return { ok: true };
  } catch (err) {
    const msg = String(err);
    await writeDebugLog(`[main] saveOnboardingConfig: FAILED — ${msg}`);
    console.error("[main] saveOnboardingConfig failed:", err);
    return { ok: false, error: msg };
  }
});

// IPC：验证 API Key（发轻量探测请求到 provider 端点）
ipcMain.handle(
  "onboarding:validateApiKey",
  async (_, authMethod: string, apiKey: string) => {
    await writeDebugLog(`[main] validateApiKey: authMethod=${authMethod}`);
    const result = await validateApiKey(authMethod, apiKey);
    await writeDebugLog(
      `[main] validateApiKey result: ${JSON.stringify(result)}`,
    );
    return result;
  },
);

// IPC：OAuth 启动 — 打开浏览器跳转到 OAuth 页面
ipcMain.handle("onboarding:oauthStart", async (_, authMethod: string) => {
  await writeDebugLog(`[main] oauthStart: authMethod=${authMethod}`);
  const result = await oauthStart(authMethod);
  await writeDebugLog(`[main] oauthStart result: ${JSON.stringify(result)}`);
  return result;
});

// IPC：OAuth 轮询 — 检测 auth-profiles.json 中是否有 token 写入
ipcMain.handle("onboarding:oauthPoll", async (_, authMethod: string) => {
  const result = await oauthPoll(authMethod);
  if (result.ok || result.error !== "pending") {
    await writeDebugLog(`[main] oauthPoll: ${JSON.stringify(result)}`);
  }
  return result;
});

// IPC：OAuth 取消 — 清理活跃会话
ipcMain.handle("onboarding:oauthCancel", async (_, authMethod: string) => {
  clearOAuthSession(authMethod);
  await writeDebugLog(`[main] oauthCancel: authMethod=${authMethod}`);
  return { ok: true };
});

// IPC：Bossim user account auth
ipcMain.handle("auth:start", async () => authStart());
ipcMain.handle("auth:poll", async () => authPoll());
ipcMain.handle("auth:cancel", async () => authCancel());
ipcMain.handle("auth:getSession", async () => authGetSession());
ipcMain.handle("auth:logout", async () => authLogout());

// IPC：验证邀请码 — 调用后端 API 返回关联的 apiKey 和 model
ipcMain.handle("onboarding:validateInviteCode", async (_, code: string) => {
  await writeDebugLog(
    `[main] validateInviteCode: code=${code.substring(0, 8)}...`,
  );
  try {
    const result = await validateInviteCode(code);
    await writeDebugLog(
      `[main] validateInviteCode result: ${JSON.stringify(result)}`,
    );
    return result;
  } catch (err) {
    const msg = String(err);
    await writeDebugLog(`[main] validateInviteCode: threw — ${msg}`);
    return { ok: false, error: msg };
  }
});

// IPC：渲染进程用户确认后，退出并安装已下载的新版本
ipcMain.handle("app:install-update", async () => {
  await quitAndInstall();
});

// IPC：Onboarding 完成，切换到 ui-react 主界面
ipcMain.handle("onboarding:complete", async () => {
  mlog("[main] Onboarding 完成，切换到 ui-react 主界面");
  unregisterWizardIpc();
  const port = getGatewayPort();
  const token = readExistingGatewayToken() || getGatewayToken();
  if (mainWindow) {
    loadRendererPage(mainWindow, "index", {
      port,
      token,
    });
    // Do not block UI navigation; pairing request is created after renderer connects.
    void approvePendingControlUiDevicePairing({ port, token }).then((approved) => {
      mlog(
        `[main] device pairing auto-approve: ${approved ? "approved" : "no pending request"}`,
      );
    });
  }
  return { ok: true };
});

/**
 * 修补现有配置，确保 Electron renderer 可以连接 Gateway。
 * 在 startGateway 之前调用，对已配置和新配置均生效。
 * 使用内嵌静态 HTTP server 后，renderer origin 是 http://127.0.0.1:PORT，
 * Gateway 的 loopback 检查会直接放行，无需 file:// 特殊处理。
 */
function patchConfigForElectron(staticServerPort: number): void {
  const override = process.env.OPENCLAW_CONFIG_DIR?.trim();
  const baseDir = override || path.join(os.homedir(), ".openclaw");
  const cfgPath = path.join(baseDir, "openclaw.json");
  try {
    const raw = fs.readFileSync(cfgPath, "utf8");
    const cfg = JSON.parse(raw) as Record<string, unknown>;
    let dirty = false;

    // 1. If plugins.slots.memory is explicitly set to "memory-core" (a plugin
    // not bundled in the Electron app), remove it so Gateway uses its default
    // resolution. If memory-core IS available (future), this is a no-op.
    // Note: with the static HTTP server approach, memory-core CAN load normally
    // because the renderer origin is now a valid loopback HTTP origin.
    const plugins = (cfg.plugins ?? {}) as Record<string, unknown>;
    const slots = (plugins.slots ?? {}) as Record<string, unknown>;
    if (slots.memory === "none") {
      // Previously we set this to "none" to work around the file:// origin issue.
      // Now that we use a static HTTP server, remove the restriction so
      // memory-core can load if available.
      const { memory: _m, ...restSlots } = slots;
      if (Object.keys(restSlots).length === 0) {
        const { slots: _s, ...restPlugins } = plugins;
        cfg.plugins = restPlugins;
      } else {
        plugins.slots = restSlots;
        cfg.plugins = plugins;
      }
      dirty = true;
      mlog(
        "[main] patchConfigForElectron: removed plugins.slots.memory=none restriction",
      );
    } else {
      cfg.plugins = plugins;
    }

    // 1b. Log any plugins.entries that reference extensions not bundled in the
    // Electron app, but do NOT remove them. Extensions installed globally
    // (~/.openclaw/extensions/) or via plugins.load.paths are valid at runtime
    // even though the Electron app itself only ships memory-core. Deleting these
    // entries would silently destroy the user's CLI-configured plugin settings.
    // Gateway will emit its own warn/error diagnostics for truly missing plugins.
    // All extensions bundled in the Electron app (see electron-builder.yml extraResources).
    // Keep in sync with the extensions listed there.
    const BUNDLED_PLUGIN_IDS = new Set([
      // 基础设施
      "memory-core",
      "memory-lancedb",
      "device-pair",
      "shared",
      "diagnostics-otel",
      "diffs",
      "llm-task",
      "lobster",
      "open-prose",
      "thread-ownership",
      "test-utils",
      // AI Provider 认证
      "qwen-portal-auth",
      "minimax-portal-auth",
      "google-gemini-cli-auth",
      "google-antigravity-auth",
      "copilot-proxy",
      // 消息通道
      "telegram",
      "discord",
      "slack",
      "signal",
      "whatsapp",
      "imessage",
      "matrix",
      "msteams",
      "feishu",
      "openclaw-weixin",
      "googlechat",
      "irc",
      "line",
      "mattermost",
      "nextcloud-talk",
      "nostr",
      "synology-chat",
      "tlon",
      "twitch",
      "zalo",
      "zalouser",
      // 语音 / 设备控制
      "voice-call",
      "talk-voice",
      "phone-control",
      "acpx",
      "bluebubbles",
    ]);
    const entries = (plugins.entries ?? {}) as Record<string, unknown>;
    const nonBundledEntries = Object.keys(entries).filter(
      (id) => !BUNDLED_PLUGIN_IDS.has(id),
    );
    if (nonBundledEntries.length > 0) {
      mlogWarn(
        `[main] patchConfigForElectron: non-bundled plugins (kept): ${nonBundledEntries.join(", ")}`,
      );
    }

    // 2. Merge controlUi.allowedOrigins — keep canonical origins, prune stale static ports
    const gw = (cfg.gateway ?? {}) as Record<string, unknown>;
    const gatewayPort = typeof gw.port === "number" ? gw.port : 18789;
    const controlUi = (gw.controlUi ?? {}) as Record<string, unknown>;
    const existing = Array.isArray(controlUi.allowedOrigins)
      ? (controlUi.allowedOrigins as string[])
      : [];
    const merged = mergeElectronControlUiAllowedOrigins({
      existing,
      gatewayPort,
      staticServerPort,
      devUiUrl: process.env.VITE_UI_REACT_URL,
    });
    if (
      merged.length !== existing.length ||
      merged.some((origin, index) => origin !== existing[index])
    ) {
      gw.controlUi = { ...controlUi, allowedOrigins: merged };
      cfg.gateway = gw;
      dirty = true;
      mlog(
        `[main] patchConfigForElectron: updated controlUi.allowedOrigins (${existing.length} → ${merged.length})`,
      );
    }

    if (dirty) {
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), "utf8");
      mlogNote(`[main] patchConfigForElectron: updated ${cfgPath}`);
    }
  } catch (err) {
    // Config doesn't exist yet (first launch) — skip
    mainLogInfo(`[main] patchConfigForElectron: skipped (${String(err)})`);
  }
}

async function main() {
  await app.whenReady();
  subscribeAuthSessionChanged((user) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(getAuthSessionChangedChannel(), { user });
    }
  });
  mainLogInfo(
    `[main] ready platform=${process.platform} packaged=${app.isPackaged}`,
  );

  sessionTokenForStartup = generateToken();

  staticServerPort = 0;
  if (app.isPackaged) {
    try {
      const uiReactDir = path.join(process.resourcesPath, "control-ui-react");
      staticServerPort = await startStaticServer(uiReactDir);
    } catch (err) {
      mlogError("[main] 静态 server 启动失败:", err);
    }
  } else {
    try {
      staticServerPort = await resolveDevStaticServerPort(startStaticServer);
    } catch (err) {
      mlogError("[main] dev 静态 server 启动失败:", err);
    }
  }

  configureSession(getGatewayPort());

  mainWindow = createWindow();
  mainWindow.show();

  const firstLaunch = isFirstLaunch();
  const useBootSplash = shouldUseBootSplash();
  if (useBootSplash) {
    loadSplashPage(mainWindow);
    await waitForSplashReady(mainWindow);
  } else if (firstLaunch) {
    loadRendererPage(mainWindow, "setup", {
      port: DEFAULT_GATEWAY_PORT,
      token: sessionTokenForStartup,
      windowAlreadyVisible: true,
    });
  }

  const ctx = buildStartupContext(firstLaunch);
  if (ctx) {
    void runStartupPipeline(ctx).then((result) => {
      configureSession(result.port);
      mlogNote(
        `[main] startup complete gateway=${result.gatewayStarted} port=${result.port} firstLaunch=${result.firstLaunch}`,
      );
    }).catch((err) => {
      mlogError("[main] 启动 pipeline 失败:", err);
    });
  }

  if (app.isPackaged && mainWindow) {
    initAutoUpdater(mainWindow);
    setTimeout(() => {
      checkForUpdates();
    }, 20_000);
    setInterval(
      () => {
        checkForUpdates();
      },
      4 * 60 * 60 * 1_000,
    );
  }

}

main().catch((err) => {
  mlogError("[main] 未处理的错误:", err);
  app.quit();
});
