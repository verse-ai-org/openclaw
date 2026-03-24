import type { OpenClawApp } from "./app.ts";
import { defaultInviteCodeClient, InviteCodeRedeemResponse } from "./invite-code-client.ts";

// ============================================================================
// Types
// ============================================================================

export interface InviteCodeVerificationResponse {
  llm_api_key: string;
  llm_base_url?: string;
  tts_api_key?: string;
  [key: string]: string | undefined;
}

export interface InviteCodeVerificationResult {
  success: boolean;
  data?: InviteCodeVerificationResponse;
  error?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

// 新的API客户端使用HMAC-SHA256签名认证，不需要额外的HTTP头部辅助函数

// ============================================================================
// Main Verification Function
// ============================================================================

export async function verifyInviteCode(
  host: OpenClawApp,
  inviteCode: string
): Promise<InviteCodeVerificationResult> {
  // Validate input
  if (!inviteCode?.trim()) {
    return {
      success: false,
      error: "Invite code is required"
    };
  }

  // 验证邀请码格式
  if (!defaultInviteCodeClient.validateCodeFormat(inviteCode)) {
    return {
      success: false,
      error: "Invalid invite code format. Expected format: BOSS-XXXX-XXXX"
    };
  }

  try {
    console.log("[InviteCode] 开始验证邀请码:", inviteCode);
    
    // 使用新的API客户端进行验证
    const response: InviteCodeRedeemResponse = await defaultInviteCodeClient.redeem(inviteCode.trim());
    
    // 处理业务错误码
    if (response.code !== 200) {
      const errorMessage = getErrorMessage(response.code, response.message);
      return {
        success: false,
        error: errorMessage
      };
    }

    // 验证响应数据结构
    if (!response.data) {
      return {
        success: false,
        error: "Empty response data"
      };
    }

    // 检查必需字段
    if (!response.data.llm_api_key) {
      return {
        success: false,
        error: "Missing llm_api_key in response"
      };
    }

    // 返回成功结果
    return {
      success: true,
      data: {
        llm_api_key: response.data.llm_api_key,
        llm_base_url: response.data.llm_base_url,
        tts_api_key: response.data.tts_api_key,
        ...response.data // 包含其他可能的字段
      }
    };

  } catch (err) {
    console.error("[InviteCode] 验证过程中发生错误:", err);
    return {
      success: false,
      error: `Network error: ${String(err)}`
    };
  }
}

// ==================== 辅助函数 ====================

/**
 * 根据错误码获取用户友好的错误消息
 * @param code 错误码
 * @param defaultMessage 默认消息
 * @returns 用户友好的错误消息
 */
function getErrorMessage(code: number, defaultMessage: string): string {
  const errorMessages: Record<number, string> = {
    400: "Invalid invite code or code has been used",
    401: "Authentication failed. Please check your app credentials.",
    403: "Access forbidden. The invite code may be disabled or expired.",
    429: "Too many requests. Please try again later.",
    500: "Server error. Please try again later.",
    503: "Service temporarily unavailable. Please try again later."
  };

  return errorMessages[code] || defaultMessage || `Verification failed (code: ${code})`;
}

// ============================================================================
// App Integration Functions
// ============================================================================

export async function handleInviteCodeVerify(host: OpenClawApp): Promise<void> {
  // 防止重复提交
  if (host.inviteCodeVerifying) {
    return;
  }

  // 清除之前的错误状态
  host.inviteCodeError = null;
  
  // 设置加载状态
  host.inviteCodeVerifying = true;
  host.inviteCodeVerified = false;

  try {
    const result = await verifyInviteCode(host, host.inviteCode);
    
    if (result.success && result.data) {
      // 验证成功，保存结果
      host.llmApiKey = result.data.llm_api_key;
      // 如果有llm_base_url，则使用它作为模型标识
      host.llmModel = result.data.llm_base_url || 'default-model';
      host.inviteCodeVerified = true;
      host.inviteCodeError = null;
      
      // 可以在这里添加成功提示或者自动跳转逻辑
      console.log("Invite code verified successfully:", result.data);
    } else {
      // 验证失败
      host.inviteCodeError = result.error ?? "Verification failed";
      host.inviteCodeVerified = false;
      host.llmApiKey = null;
      host.llmModel = null;
    }
  } catch (err) {
    // 异常处理
    host.inviteCodeError = `Unexpected error: ${String(err)}`;
    host.inviteCodeVerified = false;
    host.llmApiKey = null;
    host.llmModel = null;
  } finally {
    // 重置加载状态
    host.inviteCodeVerifying = false;
  }
}

export function handleInviteCodeInput(host: OpenClawApp, code: string): void {
  host.inviteCode = code;
  // 清除之前的状态当用户输入时
  if (host.inviteCodeError || host.inviteCodeVerified) {
    host.inviteCodeError = null;
    host.inviteCodeVerified = false;
  }
}
