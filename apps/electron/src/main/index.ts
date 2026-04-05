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
  readExistingGatewayToken,
  warmLoginShellEnv,
  onGatewayCrash,
} from "./gateway.js";
import {
  isFirstLaunch,
  saveOnboardingConfig,
  writeDebugLog,
  mainLogSync,
  type OnboardingConfig,
} from "./onboarding.js";
import { validateApiKey, validateInviteCode } from "./onboarding-validate.js";
import {
  oauthStart,
  oauthPoll,
  clearOAuthSession,
  handleOAuthProtocolCallback,
} from "./onboarding-oauth.js";
import { generateToken } from "./token.js";
import {
  createWindow,
  configureSession,
  loadRendererPage,
  startStaticServer,
} from "./window.js";
import { registerWizardIpc, unregisterWizardIpc } from "./ipc-wizard.js";
import { initAutoUpdater, checkForUpdates, quitAndInstall } from "./updater.js";

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
  if (url) {
    dispatchOAuthCallback(url);
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
    // Wizard 完成后 openclaw.json 已写入新 token，需从磁盘读取以保持同步。
    // 若读取失败（文件不存在等），退化为使用内存缓存的 token。
    const freshToken = readExistingGatewayToken() || getGatewayToken();
    await restartGateway({ token: freshToken });
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
ipcMain.handle("app:install-update", () => {
  quitAndInstall();
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
      mlog(
        `[main] patchConfigForElectron: non-bundled plugin entries present (kept): ${nonBundledEntries.join(", ")}`,
      );
    }

    // 2. Add controlUi.allowedOrigins — static server origin + loopback + file:// fallback
    const gw = (cfg.gateway ?? {}) as Record<string, unknown>;
    const gatewayPort = typeof gw.port === "number" ? gw.port : 18789;
    const controlUi = (gw.controlUi ?? {}) as Record<string, unknown>;
    const existing = Array.isArray(controlUi.allowedOrigins)
      ? (controlUi.allowedOrigins as string[])
      : [];
    const needed = [
      `http://127.0.0.1:${gatewayPort}`,
      `http://localhost:${gatewayPort}`,
      "file://",
      ...(staticServerPort > 0 ? [`http://127.0.0.1:${staticServerPort}`] : []),
    ];
    const merged = Array.from(new Set([...existing, ...needed]));
    if (
      merged.length !== existing.length ||
      needed.some((o) => !existing.includes(o))
    ) {
      gw.controlUi = { ...controlUi, allowedOrigins: merged };
      cfg.gateway = gw;
      dirty = true;
      mlog(
        `[main] patchConfigForElectron: updated controlUi.allowedOrigins=${JSON.stringify(merged)}`,
      );
    }

    if (dirty) {
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), "utf8");
      mlog(`[main] patchConfigForElectron: wrote ${cfgPath}`);
    } else {
      mlog("[main] patchConfigForElectron: no changes needed");
    }
  } catch (err) {
    // Config doesn't exist yet (first launch) — skip
    mlog(`[main] patchConfigForElectron: skipped (${String(err)})`);
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

  // Pre-warm login shell env in parallel with static server startup so it's
  // ready before spawnGateway() needs it. Errors are handled inside warmLoginShellEnv.
  const shellEnvWarm = warmLoginShellEnv();
  mlog("[main] warmLoginShellEnv 启动");

  // 启动内嵌静态 HTTP server（打包时提供 ui-react，使 renderer origin 为 http://127.0.0.1:PORT）
  let staticServerPort = 0;
  if (app.isPackaged) {
    try {
      const uiReactDir = path.join(process.resourcesPath, "control-ui-react");
      staticServerPort = await startStaticServer(uiReactDir);
      mlog(`[main] 静态 server 已启动，端口: ${staticServerPort}`);
    } catch (err) {
      mlogError("[main] 静态 server 启动失败:", err);
    }
  }

  // Ensure shell env is resolved before spawning Gateway subprocess.
  await shellEnvWarm;
  mlog("[main] warmLoginShellEnv 完成");

  // 启动 Gateway（内部决策：复用外部 / 使用配置端口 / 使用独立端口）
  let gatewayStarted = false;
  try {
    mlog("[main] 开始启动 Gateway…");
    patchConfigForElectron(staticServerPort);
    await startGateway({ token: sessionToken });
    gatewayStarted = true;
    mlog("[main] Gateway 启动成功");
    // Register crash handler so the renderer can show a reconnect prompt.
    onGatewayCrash((code, signal) => {
      mlog(`[main] Gateway 崩溃: code=${code} signal=${signal}，通知渲染进程`);
      mainWindow?.webContents.send("gateway:crashed", { code, signal });
    });
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

  // ─── 自动更新 ─────────────────────────────────────────────────────────────
  // 仅在打包后的生产环境中启用，开发模式跳过（electron-updater 内部也会检查）
  if (app.isPackaged) {
    initAutoUpdater(mainWindow, mlog);
    // 启动后延迟 20s 检查更新，避免影响启动性能
    setTimeout(() => {
      checkForUpdates();
    }, 20_000);
    // 每 4 小时定时检查一次
    setInterval(
      () => {
        checkForUpdates();
      },
      4 * 60 * 60 * 1_000,
    );
  }

  mlog("[main] main() 完成");
}

main().catch((err) => {
  mlogError("[main] 未处理的错误:", err);
  app.quit();
});
