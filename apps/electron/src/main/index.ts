import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import {
  startGateway,
  stopGateway,
  restartGateway,
  getGatewayToken,
  getGatewayPort,
} from "./gateway.js";
import {
  isFirstLaunch,
  saveOnboardingConfig,
  writeDebugLog,
  mainLogSync,
  type OnboardingConfig,
} from "./onboarding.js";
import { validateApiKey } from "./onboarding-validate.js";
import {
  oauthStart,
  oauthPoll,
  clearOAuthSession,
  handleOAuthProtocolCallback,
} from "./onboarding-oauth.js";
import { generateToken } from "./token.js";
import { createWindow, configureSession, loadRendererPage } from "./window.js";
import { registerWizardIpc, unregisterWizardIpc } from "./ipc-wizard.js";

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
    app.setAsDefaultProtocolClient("openclaw", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient("openclaw");
}

/** Shared handler for OAuth Protocol callbacks (macOS open-url + Windows second-instance) */
function dispatchOAuthCallback(url: string): void {
  if (url.startsWith("openclaw://oauth/")) {
    mlog(`[main] OAuth protocol callback: ${url}`);
    handleOAuthProtocolCallback(url);
  }
}

// macOS / Linux: URL Scheme callback arrives via open-url event
app.on("open-url", (event, url) => {
  event.preventDefault();
  dispatchOAuthCallback(url);
});

// Windows: second app instance receives the URL in argv
app.on("second-instance", (_event, argv) => {
  // The protocol URL is typically the last argument when launched via URL Scheme
  const url = argv.find((arg) => arg.startsWith("openclaw://"));
  if (url) dispatchOAuthCallback(url);
  // Bring existing window to foreground
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function mlog(msg: string): void {
  console.log(msg);
  mainLogSync(msg);
}
function mlogError(msg: string, err?: unknown): void {
  const d = err !== undefined ? ` ${String(err)}` : "";
  console.error(msg + d);
  mainLogSync(`[ERROR] ${msg}${d}`);
}

let mainWindow: BrowserWindow | null = null;

// macOS：点击 Dock 图标时，若窗口已关闭则重新创建
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow();
    loadRendererPage(mainWindow, "index", {
      port: getGatewayPort(),
      token: getGatewayToken(),
    });
  } else {
    mainWindow?.show();
  }
});

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
    await restartGateway({ token: getGatewayToken() });
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
    await saveOnboardingConfig(cfg);
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

// IPC：Onboarding 完成，切换到 ui-react 主界面
ipcMain.handle("onboarding:complete", () => {
  mlog("[main] Onboarding 完成，切换到 ui-react 主界面");
  // 注销 wizard IPC 并关闭 WS 连接
  unregisterWizardIpc();
  // 同一窗口切换到 ui-react 主界面，注入 Gateway 连接信息
  if (mainWindow) {
    loadRendererPage(mainWindow, "index", {
      port: getGatewayPort(),
      token: getGatewayToken(),
    });
  }
  return { ok: true };
});

/**
 * 修补现有配置，确保 Electron renderer (file:// origin) 可以连接 Gateway。
 * 在 startGateway 之前调用，对已配置和新配置均生效。
 */
function patchConfigForElectron(): void {
  const override = process.env.OPENCLAW_CONFIG_DIR?.trim();
  const baseDir = override || path.join(os.homedir(), ".openclaw");
  const cfgPath = path.join(baseDir, "openclaw.json");
  try {
    const raw = fs.readFileSync(cfgPath, "utf8");
    const cfg = JSON.parse(raw) as Record<string, unknown>;
    const gw = (cfg.gateway ?? {}) as Record<string, unknown>;
    const port = typeof gw.port === "number" ? gw.port : 18789;
    const controlUi = (gw.controlUi ?? {}) as Record<string, unknown>;
    const existing = Array.isArray(controlUi.allowedOrigins) ? controlUi.allowedOrigins as string[] : [];
    const needed = [
      `http://127.0.0.1:${port}`,
      `http://localhost:${port}`,
      "file://",
    ];
    const merged = Array.from(new Set([...existing, ...needed]));
    if (merged.length !== existing.length || needed.some(o => !existing.includes(o))) {
      gw.controlUi = { ...controlUi, allowedOrigins: merged };
      cfg.gateway = gw;
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), "utf8");
      mlog(`[main] patched gateway.controlUi.allowedOrigins in ${cfgPath}`);
    }
  } catch {
    // Config doesn't exist yet (first launch) — skip
  }
}

async function main() {
  mlog("[main] app 就绪前…");
  await app.whenReady();
  mlog(
    `[main] app.whenReady 完成；platform=${process.platform} isPackaged=${app.isPackaged} resourcesPath=${process.resourcesPath ?? "n/a"}`,
  );

  // 生成本次会话 token 备用（无配置时使用）
  const sessionToken = generateToken();
  mlog("[main] sessionToken 已生成");

  // 启动 Gateway（内部决策：复用外部 / 使用配置端口 / 使用独立端口）
  let gatewayStarted = false;
  try {
    mlog("[main] 开始启动 Gateway…");
    patchConfigForElectron();
    await startGateway({ token: sessionToken });
    gatewayStarted = true;
    mlog("[main] Gateway 启动成功");
  } catch (err) {
    mlogError("[main] Gateway 启动失败:", err);
    // Gateway 失败不阻止渲染，以便展示错误页面
  }

  const activePort = getGatewayPort();
  const activeToken = getGatewayToken();
  mlog(`[main] activePort=${activePort} gatewayStarted=${gatewayStarted}`);

  // 配置 session CSP（使用实际端口）
  configureSession(activePort);
  mlog("[main] session 已配置");

  // 创建主窗口
  mainWindow = createWindow();
  mlog("[main] 主窗口已创建");

  const firstLaunch = isFirstLaunch();
  mlog(`[main] isFirstLaunch=${firstLaunch}`);

  if (firstLaunch) {
    // 首次启动：加载 ui-react Setup Wizard 页面，注册 wizard IPC 中转
    mlog("[main] 首次启动，加载 Setup Wizard");
    registerWizardIpc(activePort, activeToken);
    loadRendererPage(mainWindow, "setup", {
      port: activePort,
      token: activeToken,
    });
  } else {
    // 已配置：直接加载 ui-react 主界面，注入 Gateway 连接信息
    mlog("[main] 已配置，加载主界面");
    loadRendererPage(mainWindow, "index", {
      port: activePort,
      token: activeToken,
    });
  }
  mlog("[main] main() 完成");
}

main().catch((err) => {
  mlogError("[main] 未处理的错误:", err);
  app.quit();
});
