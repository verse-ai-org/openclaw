import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";

/**
 * 解析 openclaw 配置文件路径。
 * 与 CLI 保持一致：~/.openclaw/openclaw.json（或 OPENCLAW_CONFIG_DIR 覆盖）
 */
function resolveConfigPath(): string {
  const override = process.env.OPENCLAW_CONFIG_DIR?.trim();
  const baseDir = override || path.join(os.homedir(), ".openclaw");
  return path.join(baseDir, "openclaw.json");
}

export interface OnboardingConfig {
  /** AI provider: 'claude' | 'gpt4' | 'gemini' | 'custom' */
  selectedModel: string;
  /** Plaintext API key entered by the user */
  apiKey: string;
  /** Agent workspace directory (tilde-prefixed ok) */
  workspace: string;
  /** Optional feature flags */
  optionalFeatures?: {
    messaging?: boolean;
    browser?: boolean;
    fileAccess?: boolean;
  };
  /** Gateway port (default 18789) */
  gatewayPort?: number;
  /** Gateway bind mode */
  gatewayBind?: "loopback" | "lan" | "custom";
  /** Gateway auth mode */
  gatewayAuth?: "token" | "password";
  /** Pre-existing gateway token to reuse (if any) */
  gatewayToken?: string;
}

// ─── Debug logging ──────────────────────────────────────────────────────────

const debugLogPath = path.join(os.homedir(), ".openclaw", "electron-onboarding.log");

/**
 * Append a timestamped line to ~/.openclaw/electron-onboarding.log.
 * Used by the renderer (via IPC) and the main process to trace the
 * full save-config → restart-gateway → switch-window sequence.
 */
export async function writeDebugLog(message: string): Promise<void> {
  try {
    const dir = path.dirname(debugLogPath);
    await fsp.mkdir(dir, { recursive: true });
    const line = `${new Date().toISOString()} ${message}\n`;
    await fsp.appendFile(debugLogPath, line, "utf8");
  } catch {
    // never throw from logging
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist onboarding parameters to ~/.openclaw/openclaw.json so that
 * isFirstLaunch() returns false on the next app start.
 *
 * This mirrors what `runOnboardingWizard` + `writeConfigFile` do in the CLI
 * path, but executed directly in the Electron main process because the
 * renderer-side SetupWizard collects config via its own static UI rather than
 * driving the Gateway WizardSession step-by-step.
 */
export async function saveOnboardingConfig(cfg: OnboardingConfig): Promise<void> {
  const cfgPath = resolveConfigPath();
  const cfgDir = path.dirname(cfgPath);

  // Ensure ~/.openclaw/ directory exists
  await fsp.mkdir(cfgDir, { recursive: true });

  // Read existing config so we can merge instead of overwrite
  let existing: Record<string, unknown> = {};
  try {
    const raw = await fsp.readFile(cfgPath, "utf8");
    existing = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // File doesn't exist yet — start fresh
  }

  // Resolve gateway token: reuse existing > provided > generate new
  const existingGw = existing.gateway as Record<string, unknown> | undefined;
  const existingAuth = existingGw?.auth as Record<string, unknown> | undefined;
  const existingToken =
    typeof existingAuth?.token === "string" && existingAuth.token.trim()
      ? existingAuth.token.trim()
      : null;
  const gatewayToken =
    existingToken ??
    (cfg.gatewayToken?.trim() || null) ??
    randomBytes(32).toString("hex");

  // Map selectedModel → provider + model config
  const modelMap: Record<string, { provider: string; model: string; envKey: string }> = {
    claude: { provider: "anthropic", model: "claude-sonnet-4-5", envKey: "ANTHROPIC_API_KEY" },
    gpt4: { provider: "openai", model: "gpt-4o", envKey: "OPENAI_API_KEY" },
    gemini: { provider: "google", model: "gemini-2.0-flash", envKey: "GOOGLE_API_KEY" },
  };
  const modelCfg = modelMap[cfg.selectedModel] ?? modelMap["claude"];

  const port = cfg.gatewayPort ?? 18789;
  const bind = cfg.gatewayBind ?? "loopback";

  const nextConfig: Record<string, unknown> = {
    ...existing,
    // Mark wizard as completed using the same schema as the CLI onboard command.
    // Gateway recognises: lastRunAt, lastRunVersion, lastRunCommand, lastRunMode.
    wizard: {
      ...((existing.wizard as Record<string, unknown>) ?? {}),
      lastRunAt: new Date().toISOString(),
      lastRunVersion: "electron",
      lastRunCommand: "onboard",
      lastRunMode: "local",
    },
    gateway: {
      ...existingGw,
      mode: "local",
      port,
      bind,
      auth: {
        mode: "token",
        token: gatewayToken,
      },
    },
    agents: {
      ...((existing.agents as Record<string, unknown>) ?? {}),
      defaults: {
        ...(((existing.agents as Record<string, unknown>)?.defaults as Record<string, unknown>) ?? {}),
        workspace: cfg.workspace || "~/.openclaw/workspace",
        // Set the default model to the one the user selected.
        model: {
          primary: `${modelCfg.provider}/${modelCfg.model}`,
        },
      },
    },
    // API key stored in env section (matches CLI onboard behaviour).
    ...(cfg.apiKey?.trim() ? {
      env: {
        ...((existing.env as Record<string, unknown>) ?? {}),
        [modelCfg.envKey]: cfg.apiKey.trim(),
      },
    } : {}),
  };

  // Write atomically: write to a temp file then rename
  const tmpPath = `${cfgPath}.tmp`;
  await fsp.writeFile(tmpPath, JSON.stringify(nextConfig, null, 2), "utf8");
  await fsp.rename(tmpPath, cfgPath);

  console.log(`[onboarding] Config saved to ${cfgPath}`);
}

/**
 * 检测是否为首次启动（未完成配置）。
 * 与 macOS shouldSkipWizard() 逻辑对齐：
 *   - 配置文件中存在非空 wizard 节 → 已完成
 *   - gateway.auth.mode / token / password 任一有值 → 已完成
 *   - gateway.mode 为 "local" 或 "remote" → 已完成
 * 以上均不满足则视为首次启动。
 */
export function isFirstLaunch(): boolean {
  const cfgPath = resolveConfigPath();
  try {
    const raw = fs.readFileSync(cfgPath, "utf8");
    const cfg = JSON.parse(raw) as Record<string, unknown>;

    // 存在非空 wizard 节，且包含 lastRunAt（CLI onboard 写入的标志）→ 向导已完成过
    const wizard = cfg?.wizard as Record<string, unknown> | undefined;
    if (wizard && typeof wizard.lastRunAt === "string" && wizard.lastRunAt.trim().length > 0) {
      return false;
    }

    const gateway = cfg?.gateway as Record<string, unknown> | undefined;

    // gateway.auth.mode / token / password 任一有值 → 已配置
    const auth = gateway?.auth as Record<string, unknown> | undefined;
    if (auth) {
      const hasMode = typeof auth.mode === "string" && auth.mode.trim().length > 0;
      const hasToken = typeof auth.token === "string" && auth.token.trim().length > 0;
      const hasPassword = typeof auth.password === "string" && auth.password.trim().length > 0;
      if (hasMode || hasToken || hasPassword) {
        return false;
      }
    }

    // gateway.mode 为 local 或 remote → 已配置
    const gatewayMode = gateway?.mode;
    if (gatewayMode === "local" || gatewayMode === "remote") {
      return false;
    }

    return true;
  } catch {
    // 文件不存在或解析失败 → 首次启动
    return true;
  }
}
