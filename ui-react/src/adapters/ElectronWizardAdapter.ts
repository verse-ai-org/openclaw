import type { WizardAdapter, ElectronAdapterConfig } from "../types/adapter";

declare global {
  interface Window {
    electronBridge: {
      wizardRequest(
        method: string,
        data: unknown,
      ): Promise<Record<string, unknown>>;
      notifyOnboardingComplete(): Promise<void>;
      restartGateway(): Promise<{ ok: boolean; error?: string }>;
      saveOnboardingConfig(
        cfg: unknown,
      ): Promise<{ ok: boolean; error?: string }>;
      writeDebugLog(message: string): Promise<void>;
      validateApiKey(
        authMethod: string,
        apiKey: string,
      ): Promise<{ ok: boolean; error?: string }>;
      oauthStart(authMethod: string): Promise<{
        ok: boolean;
        userCode?: string;
        verificationUri?: string;
        error?: string;
      }>;
      oauthPoll(authMethod: string): Promise<{
        ok: boolean;
        token?: string;
        refresh?: string;
        expires?: number;
        error?: string;
      }>;
      oauthCancel(authMethod: string): Promise<{ ok: boolean }>;
      validateInviteCode(code: string): Promise<{
        ok: boolean;
        apiKey?: string;
        model?: string;
        braveApiKey?: string;
        amapApiKey?: string;
        error?: string;
      }>;
    };
  }
}

/**
 * Electron 平台适配器
 * 通过 IPC 与主进程通信
 *
 * getConfig 回调在向导完成时被调用，返回需要持久化的配置对象。
 * 主进程会将其写入 ~/.openclaw/openclaw.json，确保下次启动不再走 wizard。
 */
export class ElectronWizardAdapter implements WizardAdapter {
  onComplete?: () => Promise<void>;
  onCancel?: () => Promise<void>;
  private getConfig?: () => unknown;

  constructor(config: ElectronAdapterConfig) {
    this.onComplete = config.onComplete;
    this.onCancel = config.onCancel;
    this.getConfig = config.getConfig;
    // Debug: log whether getConfig was provided at construction time
    this.log(
      `constructor: getConfig=${typeof config.getConfig} onComplete=${typeof config.onComplete}`,
    );
  }

  private log(msg: string) {
    const line = `[ElectronWizardAdapter] ${msg}`;
    console.log(line);
    try {
      void window.electronBridge.writeDebugLog(line);
    } catch {
      // bridge not available
    }
  }

  /**
   * 持久化 wizard 收集的配置，重启 Gateway，然后通知主进程切换界面。
   * CompletionStep 直接调用 complete() 触发此流程，
   * 不依赖 Gateway WizardSession 的 done 状态。
   */
  async complete(): Promise<void> {
    await this.finalizeOnboarding();
  }

  private async finalizeOnboarding(): Promise<void> {
    // Capture call stack to identify which code path triggered this
    const stack = new Error("finalize-caller").stack ?? "no stack";
    this.log(
      `finalizeOnboarding: start (getConfig=${typeof this.getConfig}) caller=${stack.split("\n")[2]?.trim() ?? "unknown"}`,
    );

    // 1. 保存配置到磁盘
    if (this.getConfig) {
      try {
        const cfg = this.getConfig();
        this.log(`saveOnboardingConfig: ${JSON.stringify(cfg)}`);
        const result = await window.electronBridge.saveOnboardingConfig(cfg);
        if (result.ok) {
          this.log("saveOnboardingConfig: success");
        } else {
          this.log(
            `saveOnboardingConfig: FAILED — ${result.error ?? "unknown"}`,
          );
        }
      } catch (err) {
        this.log(`saveOnboardingConfig: threw — ${String(err)}`);
      }
    } else {
      this.log("saveOnboardingConfig: skipped (no getConfig provided)");
    }

    // 2. 重启 Gateway 使新配置（token）生效
    this.log("restartGateway: start");
    try {
      const r = await window.electronBridge.restartGateway();
      this.log(
        `restartGateway: ${r.ok ? "ok" : `FAILED — ${r.error ?? "unknown"}`}`,
      );
    } catch (err) {
      this.log(`restartGateway: threw — ${String(err)}`);
    }

    // 3. 触发 onComplete 回调（UI 可在此切换到完成状态）
    this.log("onComplete callback: calling");
    try {
      await this.onComplete?.();
    } catch (err) {
      this.log(`onComplete callback: threw — ${String(err)}`);
    }

    // 4. 通知主进程切换到主界面
    this.log("notifyOnboardingComplete: calling");
    try {
      await window.electronBridge.notifyOnboardingComplete();
      this.log("notifyOnboardingComplete: done");
    } catch (err) {
      this.log(`notifyOnboardingComplete: threw — ${String(err)}`);
    }
  }

  async validateApiKey(
    authMethod: string,
    apiKey: string,
  ): Promise<{ ok: boolean; error?: string }> {
    this.log(`validateApiKey: authMethod=${authMethod}`);
    return window.electronBridge.validateApiKey(authMethod, apiKey);
  }

  async startOAuth(authMethod: string): Promise<{
    ok: boolean;
    userCode?: string;
    verificationUri?: string;
    error?: string;
  }> {
    this.log(`startOAuth: authMethod=${authMethod}`);
    return window.electronBridge.oauthStart(authMethod);
  }

  async pollOAuth(
    authMethod: string,
  ): Promise<{ ok: boolean; token?: string; error?: string }> {
    return window.electronBridge.oauthPoll(authMethod);
  }

  async cancelOAuth(authMethod: string): Promise<void> {
    this.log(`cancelOAuth: authMethod=${authMethod}`);
    await window.electronBridge.oauthCancel(authMethod);
  }

  /**
   * Validate an invite code and return the associated API key and model.
   * Delegates to the Electron bridge which calls the backend API.
   */
  async validateInviteCode(code: string): Promise<{
    ok: boolean;
    apiKey?: string;
    model?: string;
    braveApiKey?: string;
    amapApiKey?: string;
    error?: string;
  }> {
    this.log(`validateInviteCode: code=${code.substring(0, 8)}...`);
    try {
      const result = await window.electronBridge.validateInviteCode(code);
      if (result.ok && result.apiKey && result.model) {
        this.log(`validateInviteCode: success, model=${result.model}`);
        return {
          ok: true,
          apiKey: result.apiKey,
          model: result.model,
          braveApiKey: result.braveApiKey,
          amapApiKey: result.amapApiKey,
        };
      } else {
        this.log(
          `validateInviteCode: failed - ${result.error ?? "unknown error"}`,
        );
        return { ok: false, error: result.error ?? "Validation failed" };
      }
    } catch (err) {
      this.log(`validateInviteCode: threw - ${String(err)}`);
      return { ok: false, error: `Network error: ${String(err)}` };
    }
  }

  /**
   * submitStep: kept for WizardAdapter interface compatibility.
   * CompletionStep should call complete() directly — that is the correct
   * path for persisting config and switching to the main UI.
   * This fallback delegates to finalizeOnboarding for any legacy callers.
   */
  async submitStep(_stepData: unknown): Promise<boolean> {
    this.log(
      "submitStep: delegating to finalizeOnboarding (legacy compat path)",
    );
    setTimeout(() => void this.finalizeOnboarding(), 0);
    return true;
  }

  async getInitialState(): Promise<Record<string, unknown>> {
    // No wizard session needed — the Electron UI drives all steps locally.
    // Return empty state; the UI store (setup-wizard.store.ts) holds all state.
    this.log("getInitialState: returning empty state (session-less mode)");
    return {};
  }
}
