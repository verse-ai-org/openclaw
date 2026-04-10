import { contextBridge, ipcRenderer } from "electron";

/**
 * 安全桥接：通过 contextBridge 暴露有限的 Electron API 给渲染进程。
 * 渲染进程只能通过 window.electronBridge 访问这些方法，无法直接访问 Node.js API。
 *
 * 以下方法同时服务于两类页面：
 * - Renderer（React Onboarding）：wizardRequest、notifyOnboardingComplete
 * - Control UI（Lit）：restartGateway、getGatewayInfo
 */
contextBridge.exposeInMainWorld("electronBridge", {
  /** 当前运行平台 */
  platform: process.platform,

  /** 是否在 Electron 环境中运行 */
  isElectron: true,

  /**
   * 向 Gateway 发起 wizard RPC 请求（通过主进程 WS 中转）。
   * 仅在 Onboarding Renderer 页面使用；主进程注册 ipc-wizard.ts handler。
   */
  wizardRequest: (method: string, params: unknown): Promise<unknown> =>
    ipcRenderer.invoke("wizard:request", method, params),

  /**
   * 保存 Onboarding 配置到 ~/.openclaw/openclaw.json。
   * 必须在 notifyOnboardingComplete() 之前调用，确保下次启动不再走 wizard。
   */
  saveOnboardingConfig: (
    cfg: unknown,
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("onboarding:saveConfig", cfg),

  /**
   * 写调试日志到 ~/.openclaw/electron-onboarding.log。
   */
  writeDebugLog: (message: string): Promise<void> =>
    ipcRenderer.invoke("onboarding:writeDebugLog", message),

  /**
   * 通知主进程 Onboarding 已完成，主进程负责切换窗口内容到 Control UI。
   * 仅在 Onboarding Renderer 页面使用。
   */
  notifyOnboardingComplete: (): Promise<void> =>
    ipcRenderer.invoke("onboarding:complete"),

  /** 请求主进程重启 Gateway（配置更新后调用） */
  restartGateway: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("gateway:restart"),

  /** 手动重启 Gateway */
  manualGatewayRestart: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("gateway:manual-restart"),

  /** 获取当前 Gateway 连接信息 */
  getGatewayInfo: (): Promise<{ port: number; token: string; wsUrl: string }> =>
    ipcRenderer.invoke("gateway:info"),

  /**
   * 监听 Gateway 正在重启事件
   * callback 参数：{ attempt: number, maxAttempts: number }
   * 返回取消订阅函数
   */
  onGatewayRestarting: (
    callback: (data: { attempt: number; maxAttempts: number }) => void,
  ): (() => void) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      data: { attempt: number; maxAttempts: number },
    ) => callback(data);
    ipcRenderer.on("gateway:restarting", handler);
    return () => ipcRenderer.removeListener("gateway:restarting", handler);
  },

  /**
   * 监听 Gateway 重启完成事件
   * callback 参数：{ success: boolean, error?: string }
   * 返回取消订阅函数
   */
  onGatewayRestarted: (
    callback: (data: { success: boolean; error?: string }) => void,
  ): (() => void) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      data: { success: boolean; error?: string },
    ) => callback(data);
    ipcRenderer.on("gateway:restarted", handler);
    return () => ipcRenderer.removeListener("gateway:restarted", handler);
  },

  /**
   * 监听 Gateway 崩溃事件
   * callback 参数：{ code: number | null, signal: string | null }
   * 返回取消订阅函数
   */
  onGatewayCrashed: (
    callback: (data: { code: number | null; signal: string | null }) => void,
  ): (() => void) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      data: { code: number | null; signal: string | null },
    ) => callback(data);
    ipcRenderer.on("gateway:crashed", handler);
    return () => ipcRenderer.removeListener("gateway:crashed", handler);
  },

  /**
   * Validate an API key for the given auth method.
   * The main process performs a lightweight probe against the provider API.
   * Returns { ok: true } on success, { ok: false, error } on failure.
   */
  validateApiKey: (
    authMethod: string,
    apiKey: string,
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("onboarding:validateApiKey", authMethod, apiKey),

  /**
   * Fetch the model catalog for the given provider.
   * The main process calls the CLI loadModelCatalog() and returns the result.
   */
  fetchModelCatalog: (
    provider: string,
  ): Promise<
    Array<{
      provider: string;
      id: string;
      name?: string;
      contextWindow?: number;
      reasoning?: boolean;
    }>
  > => ipcRenderer.invoke("onboarding:fetchModelCatalog", provider),

  /**
   * Start an OAuth flow for the given auth method.
   * The main process opens the provider's auth URL in the system browser.
   * For MiniMax Device Code flow, also returns userCode and verificationUri.
   */
  oauthStart: (
    authMethod: string,
  ): Promise<{
    ok: boolean;
    userCode?: string;
    verificationUri?: string;
    error?: string;
  }> => ipcRenderer.invoke("onboarding:oauthStart", authMethod),

  /**
   * Poll for OAuth completion.
   * Returns { ok: true, token } once the token is written to auth-profiles.json,
   * { ok: false, error: "pending" } while still waiting,
   * or { ok: false, error: "timeout" } after 5 minutes.
   */
  oauthPoll: (
    authMethod: string,
  ): Promise<{
    ok: boolean;
    token?: string;
    refresh?: string;
    expires?: number;
    error?: string;
  }> => ipcRenderer.invoke("onboarding:oauthPoll", authMethod),

  /**
   * Cancel an in-progress OAuth flow.
   */
  oauthCancel: (authMethod: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("onboarding:oauthCancel", authMethod),

  /**
   * Validate an invite code and return the associated API key and model.
   * Returns { ok: true, apiKey, model, braveApiKey?, amapApiKey? } on success, { ok: false, error } on failure.
   */
  validateInviteCode: (
    code: string,
  ): Promise<{
    ok: boolean;
    apiKey?: string;
    model?: string;
    braveApiKey?: string;
    amapApiKey?: string;
    error?: string;
  }> => ipcRenderer.invoke("onboarding:validateInviteCode", code),

  /**
   * 监听主进程发来的"新版本已下载"事件。
   * 主进程在 autoUpdater update-downloaded 事件后发送 app:update-ready。
   * callback 参数：{ version: string, releaseNotes: string }
   * 返回取消订阅函数，组件卸载时调用。
   */
  onUpdateReady: (
    callback: (info: { version: string; releaseNotes: string }) => void,
  ): (() => void) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      info: { version: string; releaseNotes: string },
    ) => callback(info);
    ipcRenderer.on("app:update-ready", handler);
    return () => ipcRenderer.removeListener("app:update-ready", handler);
  },

  /**
   * 通知主进程退出并安装已下载的新版本。
   * 用户点击"重启安装"按钮后调用。
   */
  installUpdate: (): Promise<void> => ipcRenderer.invoke("app:install-update"),
});
