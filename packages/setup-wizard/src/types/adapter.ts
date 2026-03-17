/**
 * 平台适配器接口
 * 定义 setup-wizard 与不同平台（web、Electron 等）的交互方式
 */

export interface WizardAdapter {
  /**
   * 提交当前步骤的数据
   * @param stepData 步骤数据
   * @returns 是否完成向导
   */
  submitStep(stepData: unknown): Promise<boolean>;

  /**
   * 直接完成向导：持久化配置、重启 Gateway、切换界面。
   * CompletionStep 应调用此方法而非 submitStep，
   * 以避免依赖 Gateway WizardSession 的 done 状态。
   */
  complete?(): Promise<void>;

  /**
   * 完成向导时的回调
   */
  onComplete?(): Promise<void>;

  /**
   * 取消向导时的回调
   */
  onCancel?(): Promise<void>;

  /**
   * 获取初始状态（可选）
   */
  getInitialState?(): Promise<Record<string, unknown>>;
}

/**
 * Web 平台适配器配置
 */
export interface WebAdapterConfig {
  apiEndpoint: string;
  onComplete?: () => void;
  onCancel?: () => void;
}

/**
 * Electron 平台适配器配置
 */
export interface ElectronAdapterConfig {
  onComplete?: () => Promise<void>;
  onCancel?: () => Promise<void>;
  /**
   * 向导完成时调用，返回需要持久化到 ~/.openclaw/openclaw.json 的配置对象。
   * 应从 useWizardStore().wizardState 读取。
   */
  getConfig?: () => unknown;
}
