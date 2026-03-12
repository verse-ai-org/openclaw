import { app, BrowserWindow, ipcMain } from "electron";
import {
  startGateway,
  stopGateway,
  restartGateway,
  getGatewayToken,
  readExistingGatewayToken,
} from "./gateway.js";
import { isFirstLaunch } from "./onboarding.js";
import { generateToken } from "./token.js";
import {
  createWindow,
  configureSession,
  loadRendererPage,
  loadGatewayUI,
} from "./window.js";
import { registerWizardIpc, unregisterWizardIpc } from "./ipc-wizard.js";

// Electron 使用独立端口，避免与用户已有的 openclaw-gateway 冲突
const GATEWAY_PORT = Number(process.env.OPENCLAW_GATEWAY_PORT ?? 18790);

let mainWindow: BrowserWindow | null = null;
let sessionToken = "";

// macOS：点击 Dock 图标时，若窗口已关闭则重新创建
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow();
    loadGatewayUI(mainWindow, { port: GATEWAY_PORT, token: sessionToken });
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
    await restartGateway({ port: GATEWAY_PORT, token: getGatewayToken() });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// IPC：渲染进程获取当前 Gateway 连接信息
ipcMain.handle("gateway:info", () => {
  return {
    port: GATEWAY_PORT,
    token: getGatewayToken(),
    wsUrl: `ws://127.0.0.1:${GATEWAY_PORT}`,
  };
});

// IPC：Onboarding 完成，切换到 Control UI
ipcMain.handle("onboarding:complete", () => {
  console.log("[main] Onboarding 完成，切换到 Control UI");
  // 注销 wizard IPC 并关闭 WS 连接
  unregisterWizardIpc();
  // 同一窗口切换到 Gateway Control UI
  if (mainWindow) {
    loadGatewayUI(mainWindow, { port: GATEWAY_PORT, token: sessionToken });
  }
  return { ok: true };
});

async function main() {
  await app.whenReady();

  // 生成本次会话 token：优先复用用户配置中已有的 token
  sessionToken = readExistingGatewayToken() ?? generateToken();

  // 配置 session（CSP 等）
  configureSession(GATEWAY_PORT);

  // 启动 Gateway
  try {
    await startGateway({
      port: GATEWAY_PORT,
      token: sessionToken,
    });
  } catch (err) {
    console.error("[main] Gateway 启动失败:", err);
  }

  // 创建主窗口
  mainWindow = createWindow();

  if (isFirstLaunch()) {
    // 首次启动：加载 Onboarding React 页面，注册 wizard IPC 中转
    console.log("[main] 首次启动，加载 Onboarding 向导");
    registerWizardIpc(GATEWAY_PORT, sessionToken);
    loadRendererPage(mainWindow, "onboarding");
  } else {
    // 已配置：直接加载 Gateway Control UI
    loadGatewayUI(mainWindow, { port: GATEWAY_PORT, token: sessionToken });
  }
}

main().catch((err) => {
  console.error("[main] 未处理的错误:", err);
  app.quit();
});
