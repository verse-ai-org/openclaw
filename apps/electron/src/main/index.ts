import { app, BrowserWindow, ipcMain } from "electron";
import {
  startGateway,
  stopGateway,
  restartGateway,
  getGatewayToken,
  getGatewayPort,
} from "./gateway.js";
import { isFirstLaunch, saveOnboardingConfig, writeDebugLog, type OnboardingConfig } from "./onboarding.js";
import { generateToken } from "./token.js";
import {
  createWindow,
  configureSession,
  loadRendererPage,
} from "./window.js";
import { registerWizardIpc, unregisterWizardIpc } from "./ipc-wizard.js";

let mainWindow: BrowserWindow | null = null;

// macOS：点击 Dock 图标时，若窗口已关闭则重新创建
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow();
    loadRendererPage(mainWindow, "index", { port: getGatewayPort(), token: getGatewayToken() });
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
  await writeDebugLog(`[main] saveOnboardingConfig called: ${JSON.stringify(cfg).slice(0, 200)}`);
  try {
    await saveOnboardingConfig(cfg);
    await writeDebugLog('[main] saveOnboardingConfig: success');
    return { ok: true };
  } catch (err) {
    const msg = String(err);
    await writeDebugLog(`[main] saveOnboardingConfig: FAILED — ${msg}`);
    console.error("[main] saveOnboardingConfig failed:", err);
    return { ok: false, error: msg };
  }
});

// IPC：Onboarding 完成，切换到 ui-react 主界面
ipcMain.handle("onboarding:complete", () => {
  console.log("[main] Onboarding 完成，切换到 ui-react 主界面");
  // 注销 wizard IPC 并关闭 WS 连接
  unregisterWizardIpc();
  // 同一窗口切换到 ui-react 主界面，注入 Gateway 连接信息
  if (mainWindow) {
    loadRendererPage(mainWindow, "index", { port: getGatewayPort(), token: getGatewayToken() });
  }
  return { ok: true };
});

async function main() {
  await app.whenReady();

  // 生成本次会话 token 备用（无配置时使用）
  const sessionToken = generateToken();

  // 启动 Gateway（内部决策：复用外部 / 使用配置端口 / 使用独立端口）
  try {
    await startGateway({ token: sessionToken });
  } catch (err) {
    console.error("[main] Gateway 启动失败:", err);
  }

  const activePort = getGatewayPort();
  const activeToken = getGatewayToken();

  // 配置 session CSP（使用实际端口）
  configureSession(activePort);

  // 创建主窗口
  mainWindow = createWindow();

  if (isFirstLaunch()) {
    // 首次启动：加载 ui-react Setup Wizard 页面，注册 wizard IPC 中转
    console.log("[main] 首次启动，加载 Setup Wizard");
    registerWizardIpc(activePort, activeToken);
    loadRendererPage(mainWindow, "setup");
  } else {
    // 已配置：直接加载 ui-react 主界面，注入 Gateway 连接信息
    loadRendererPage(mainWindow, "index", { port: activePort, token: activeToken });
  }
}

main().catch((err) => {
  console.error("[main] 未处理的错误:", err);
  app.quit();
});
