import type { WizardAdapter, WebAdapterConfig } from "../types/adapter";
import { redeemInviteCode, getInviteCodeConfig } from "../lib/invite-code";

/**
 * Web 平台适配器
 * 通过 HTTP API 与后端通信
 */
export class WebWizardAdapter implements WizardAdapter {
  private apiEndpoint: string;
  private sessionId: string | null = null;
  onComplete?: () => Promise<void>;
  onCancel?: () => Promise<void>;

  constructor(config: WebAdapterConfig) {
    this.apiEndpoint = config.apiEndpoint;
    if (config.onComplete) {
      this.onComplete = async () => {
        config.onComplete!();
      };
    }
    if (config.onCancel) {
      this.onCancel = async () => {
        config.onCancel!();
      };
    }
  }

  async validateApiKey(
    authMethod: string,
    apiKey: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.apiEndpoint}/validate-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authMethod, apiKey }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return (await response.json()) as { ok: boolean; error?: string };
    } catch (error) {
      console.error("validateApiKey failed:", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Validation failed.",
      };
    }
  }

  async submitStep(stepData: unknown): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiEndpoint}/wizard/step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: this.sessionId, data: stepData }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const result = (await response.json()) as { done: boolean };
      if (result.done) {
        await this.onComplete?.();
        return true;
      }
      return false;
    } catch (error) {
      console.error("Failed to submit step:", error);
      throw error;
    }
  }

  async getInitialState(): Promise<Record<string, unknown>> {
    try {
      const response = await fetch(`${this.apiEndpoint}/wizard/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const result = (await response.json()) as {
        sessionId: string;
        state?: Record<string, unknown>;
      };
      this.sessionId = result.sessionId;
      return result.state ?? {};
    } catch (error) {
      console.error("Failed to initialize wizard:", error);
      throw error;
    }
  }

  /**
   * Validate an invite code via the backend.
   * Uses HMAC-SHA256 signed headers per the API spec.
   * The base URL is resolved from env (VITE_INVITE_CODE_API_BASE_URL) or defaults
   * to localhost:8080 (dev) / Railway (prod).
   */
  async validateInviteCode(
    code: string,
  ): Promise<{ ok: boolean; apiKey?: string; model?: string; error?: string }> {
    // Use the dedicated invite-code config (separate base URL from wizard API endpoint).
    return redeemInviteCode(code, getInviteCodeConfig());
  }
}
