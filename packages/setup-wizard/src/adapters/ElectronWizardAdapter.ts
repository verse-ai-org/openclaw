import type { WizardAdapter, ElectronAdapterConfig } from '../types/adapter';

declare global {
  interface Window {
    electronBridge: {
      wizardRequest(method: string, data: unknown): Promise<Record<string, unknown>>;
      notifyOnboardingComplete(): Promise<void>;
      restartGateway(): Promise<{ ok: boolean; error?: string }>;
      saveOnboardingConfig(cfg: unknown): Promise<{ ok: boolean; error?: string }>;
      writeDebugLog(message: string): Promise<void>;
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
  private sessionId: string | null = null;
  onComplete?: () => Promise<void>;
  onCancel?: () => Promise<void>;
  private getConfig?: () => unknown;

  constructor(config: ElectronAdapterConfig) {
    this.onComplete = config.onComplete;
    this.onCancel = config.onCancel;
    this.getConfig = config.getConfig;
    // Debug: log whether getConfig was provided at construction time
    this.log(`constructor: getConfig=${typeof config.getConfig} onComplete=${typeof config.onComplete}`);
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
    const stack = new Error('finalize-caller').stack ?? 'no stack';
    this.log(`finalizeOnboarding: start (getConfig=${typeof this.getConfig}) caller=${stack.split('\n')[2]?.trim() ?? 'unknown'}`);

    // 1. 保存配置到磁盘
    if (this.getConfig) {
      try {
        const cfg = this.getConfig();
        this.log(`saveOnboardingConfig: ${JSON.stringify(cfg)}`);
        const result = await window.electronBridge.saveOnboardingConfig(cfg);
        if (result.ok) {
          this.log('saveOnboardingConfig: success');
        } else {
          this.log(`saveOnboardingConfig: FAILED — ${result.error ?? 'unknown'}`);
        }
      } catch (err) {
        this.log(`saveOnboardingConfig: threw — ${String(err)}`);
      }
    } else {
      this.log('saveOnboardingConfig: skipped (no getConfig provided)');
    }

    // 2. 重启 Gateway 使新配置（token）生效
    this.log('restartGateway: start');
    try {
      const r = await window.electronBridge.restartGateway();
      this.log(`restartGateway: ${r.ok ? 'ok' : `FAILED — ${r.error ?? 'unknown'}`}`);
    } catch (err) {
      this.log(`restartGateway: threw — ${String(err)}`);
    }

    // 3. 触发 onComplete 回调（UI 可在此切换到完成状态）
    this.log('onComplete callback: calling');
    try {
      await this.onComplete?.();
    } catch (err) {
      this.log(`onComplete callback: threw — ${String(err)}`);
    }

    // 4. 通知主进程切换到主界面
    this.log('notifyOnboardingComplete: calling');
    try {
      await window.electronBridge.notifyOnboardingComplete();
      this.log('notifyOnboardingComplete: done');
    } catch (err) {
      this.log(`notifyOnboardingComplete: threw — ${String(err)}`);
    }
  }

  /**
   * submitStep: 保留兼容性，但在 Electron 中 CompletionStep 应直接调 complete()。
   * 这里不再依赖 wizard.next 返回 done，只是透传给 Gateway 做记录。
   */
  async submitStep(stepData: unknown): Promise<boolean> {
    this.log(`submitStep: ${JSON.stringify(stepData)}`);
    // 如果没有 session（wizard.start 未成功），直接完成
    if (!this.sessionId) {
      this.log('submitStep: no sessionId, calling finalizeOnboarding directly');
      setTimeout(() => void this.finalizeOnboarding(), 0);
      return true;
    }
    try {
      const result = await window.electronBridge.wizardRequest('wizard.next', {
        sessionId: this.sessionId,
        answer: stepData,
      });
      this.log(`wizard.next result: ${JSON.stringify(result)}`);
      if (result['done']) {
        setTimeout(() => void this.finalizeOnboarding(), 1200);
        return true;
      }
      return false;
    } catch (error) {
      this.log(`wizard.next threw: ${String(error)} — falling back to finalizeOnboarding`);
      // wizard session 失败也要完成 onboarding（配置已通过 complete() 保存）
      setTimeout(() => void this.finalizeOnboarding(), 0);
      return true;
    }
  }

  async getInitialState(): Promise<Record<string, unknown>> {
    this.log('getInitialState: wizard.start');
    try {
      const result = await window.electronBridge.wizardRequest('wizard.start', { mode: 'local' });
      this.log(`wizard.start result: ${JSON.stringify(result)}`);
      if (result['sessionId']) {
        this.sessionId = result['sessionId'] as string;
        return (result['state'] as Record<string, unknown>) ?? {};
      }
      if (result['done']) {
        // wizard.start says already done — but we are in the onboarding UI,
        // which means the config was NOT yet saved (this is the first launch).
        // Do NOT auto-finalize here; let the user complete the UI steps and
        // click "Start Chatting" so getConfig() is called with real data.
        this.log('wizard.start: returned done=true (stale session), ignoring — will finalize via complete()');
        return {};
      }
      this.log('wizard.start: unexpected result, continuing without session');
      return {};
    } catch (error) {
      this.log(`wizard.start threw: ${String(error)} — continuing without session`);
      // gateway wizard session 失败不阻断前端流程
      return {};
    }
  }
}
