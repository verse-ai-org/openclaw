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
   * 通知主进程 Onboarding 已完成，主进程负责切换窗口内容到 Control UI。
   * 仅在 Onboarding Renderer 页面使用。
   */
  notifyOnboardingComplete: (): Promise<void> =>
    ipcRenderer.invoke("onboarding:complete"),

  /** 请求主进程重启 Gateway（配置更新后调用） */
  restartGateway: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("gateway:restart"),

  /** 获取当前 Gateway 连接信息 */
  getGatewayInfo: (): Promise<{ port: number; token: string; wsUrl: string }> =>
    ipcRenderer.invoke("gateway:info"),
});
