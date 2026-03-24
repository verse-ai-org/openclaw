/**
 * 邀请码API客户端 - 基于HMAC-SHA256签名认证
 * 实现文档参考: /docs/features/invite-code-api-design.md
 */

// ==================== 类型定义 ====================
export interface InviteCodeRedeemRequest {
  code: string;
}

export interface ApiKeyConfig {
  llm_api_key?: string;
  llm_base_url?: string;
  tts_api_key?: string;
  [key: string]: string | undefined;
}

export interface InviteCodeRedeemResponse {
  code: number;
  message: string;
  data?: ApiKeyConfig;
}

export interface ClientConfig {
  baseUrl: string;
  appId: string;
  appSecret: string;
  deviceId?: string;
  appVersion?: string;
}

// ==================== 配置管理 ====================
/**
 * 开发环境配置
 * 注意：生产环境应该从安全存储中获取这些值
 */
const DEV_CONFIG: ClientConfig = {
  baseUrl: 'http://localhost:8080', // 本地Java后端服务地址
  appId: 'boss-simulator',
  appSecret: 'boss-simulator-dev-secret-change-in-prod',
  appVersion: '1.0.0'
};

/**
 * 获取客户端配置
 * @param isDev 是否为开发环境
 * @returns 客户端配置
 */
export function getClientConfig(isDev: boolean = true): ClientConfig {
  if (isDev) {
    return DEV_CONFIG;
  }
  // 生产环境配置应该从环境变量或安全存储中获取
  return {
    baseUrl: process.env.INVITE_CODE_API_BASE_URL || '',
    appId: process.env.INVITE_CODE_APP_ID || '',
    appSecret: process.env.INVITE_CODE_APP_SECRET || '',
    deviceId: process.env.DEVICE_ID,
    appVersion: process.env.APP_VERSION
  };
}

// ==================== 签名工具函数 ====================
/**
 * 生成 HMAC-SHA256 签名（浏览器环境使用Web Crypto API）
 * @param appSecret App密钥
 * @param appId App ID
 * @param timestamp 时间戳（秒级）
 * @param nonce 随机字符串
 * @param code 邀请码
 * @returns 十六进制签名字符串
 */
export async function generateSignature(
  appSecret: string,
  appId: string,
  timestamp: string,
  nonce: string,
  code: string
): Promise<string> {
  const signPayload = `app_id=${appId}&timestamp=${timestamp}&nonce=${nonce}&code=${code}`;
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(appSecret);
  const messageData = encoder.encode(signPayload);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  
  // 转换为十六进制字符串
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 生成随机 nonce
 * @param length 长度，默认12位
 * @returns 随机字符串
 */
export function generateNonce(length: number = 12): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

/**
 * 获取当前时间戳（秒级）
 * @returns 时间戳字符串
 */
export function getTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

// ==================== 邀请码客户端主类 ====================
export class InviteCodeClient {
  private readonly config: ClientConfig;

  constructor(config: ClientConfig = getClientConfig()) {
    this.config = config;
  }

  /**
   * 兑换邀请码
   * @param code 邀请码
   * @returns API响应结果
   */
  async redeem(code: string): Promise<InviteCodeRedeemResponse> {
    try {
      const timestamp = getTimestamp();
      const nonce = generateNonce();
      
      // 注意：后端从 request.getParameter("code") 获取code，
      // 对于JSON请求体，这个值为空字符串
      // 因此签名时code参数传空字符串以匹配后端行为
      const signatureCode = ""; // 后端实际获取到的code值
      
      const signature = await generateSignature(
        this.config.appSecret,
        this.config.appId,
        timestamp,
        nonce,
        signatureCode
      );

      const headers: Record<string, string> = {
        'X-App-Id': this.config.appId,
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
        'X-Signature': signature,
        'Content-Type': 'application/json',
      };

      // 添加可选请求头
      if (this.config.deviceId) {
        headers['X-Device-Id'] = this.config.deviceId;
      }
      if (this.config.appVersion) {
        headers['X-App-Version'] = this.config.appVersion;
      }

      const url = `${this.config.baseUrl}/api/v1/app/member/invite-code/redeem`;
      const body: InviteCodeRedeemRequest = { code };

      console.log('[InviteCodeClient] 发送请求:', {
        url,
        headers: {
          ...headers,
          'X-Signature': '[HIDDEN]' // 隐藏签名信息
        },
        body
      });

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result: InviteCodeRedeemResponse = await response.json();
      console.log('[InviteCodeClient] 收到响应:', result);
      
      return result;
    } catch (error) {
      console.error('[InviteCodeClient] 请求失败:', error);
      throw error;
    }
  }

  /**
   * 验证邀请码格式
   * @param code 邀请码
   * @returns 是否符合格式要求
   */
  validateCodeFormat(code: string): boolean {
    // 根据文档要求：邀请码格式为 BOSS-XXXX-XXXX
    const pattern = /^BOSS-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    return pattern.test(code.toUpperCase());
  }
}

// ==================== 导出默认实例 ====================
/**
 * 默认的邀请码客户端实例（开发环境）
 */
export const defaultInviteCodeClient = new InviteCodeClient();

/**
 * 创建自定义配置的客户端实例
 * @param config 自定义配置
 * @returns 客户端实例
 */
export function createInviteCodeClient(config: Partial<ClientConfig> = {}): InviteCodeClient {
  const defaultConfig = getClientConfig(true);
  return new InviteCodeClient({ ...defaultConfig, ...config });
}
