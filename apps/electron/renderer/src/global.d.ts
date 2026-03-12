/**
 * electronBridge 类型声明。
 * 由 preload/index.ts 通过 contextBridge.exposeInMainWorld("electronBridge", ...) 注入。
 */
export {};

declare global {
  interface Window {
    electronBridge: {
      /** 当前运行平台 */
      platform: string;
      /** 是否在 Electron 环境中运行 */
      isElectron: true;
      /** 向 Gateway 发起 wizard RPC 请求（主进程 WS 中转） */
      wizardRequest: (method: string, params: unknown) => Promise<unknown>;
      /** 通知主进程 Onboarding 已完成，主进程切换到 Control UI */
      notifyOnboardingComplete: () => Promise<void>;
      /** 获取当前 Gateway 连接信息 */
      getGatewayInfo: () => Promise<{ port: number; token: string; wsUrl: string }>;
      /** 请求主进程重启 Gateway（Onboarding 完成后可选调用） */
      restartGateway: () => Promise<{ ok: boolean; error?: string }>;
    };
  }
}
