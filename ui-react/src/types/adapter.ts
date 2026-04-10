/**
 * 平台适配器接口
 * 定义 setup-wizard 与不同平台（web、Electron 等）的交互方式
 */

/** Single entry from the model catalog (mirrors CLI model-catalog shape). */
export interface ModelCatalogEntry {
  provider: string;
  id: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
}

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

  /**
   * Validate an API key for the given auth method.
   * Returns { ok: true } on success, { ok: false, error } on failure.
   * If not implemented, the UI falls back to basic format validation.
   */
  validateApiKey?(
    authMethod: string,
    apiKey: string,
  ): Promise<{ ok: boolean; error?: string }>;

  /**
   * Start an OAuth flow for the given auth method.
   * The implementation should open the provider's auth URL in the system browser.
   * Returns { ok: true } if browser was opened, { ok: false, error } otherwise.
   * For Device Code flows (e.g. MiniMax), also returns userCode and verificationUri.
   */
  startOAuth?(authMethod: string): Promise<{
    ok: boolean;
    userCode?: string;
    verificationUri?: string;
    error?: string;
  }>;

  /**
   * Poll for OAuth completion.
   * Called repeatedly (every ~2s) after startOAuth().
   * Returns { ok: true, token } when complete, { ok: false, error: "pending" } while waiting,
   * or { ok: false, error: "timeout" } / other error string when failed.
   */
  pollOAuth?(authMethod: string): Promise<{
    ok: boolean;
    token?: string;
    refresh?: string;
    expires?: number;
    error?: string;
  }>;

  /**
   * Cancel an in-progress OAuth flow.
   */
  cancelOAuth?(authMethod: string): Promise<void>;

  /**
   * Fetch the model catalog for the given provider from the backend.
   * Used by DefaultModelStep to show available models.
   * If not implemented, the UI uses the built-in static list.
   */
  fetchModelCatalog?(provider: string): Promise<ModelCatalogEntry[]>;

  /**
   * Validate an invite code and return the associated API key and model.
   * Returns { ok: true, apiKey, model } on success.
   * Returns { ok: false, error } on failure.
   * If not implemented, the UI will show an error message.
   */
  validateInviteCode?(code: string): Promise<{
    ok: boolean;
    apiKey?: string;
    model?: string;
    braveApiKey?: string;
    amapApiKey?: string;
    error?: string;
  }>;
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
