import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";
import {
  LEGACY_MODEL_MAP,
  PROVIDER_ENV_KEY_MAP,
  PROVIDER_REGISTRY,
} from "./onboarding-providers.js";

/**
 * 解析 openclaw 配置文件路径。
 * 与 CLI 保持一致：~/.openclaw/openclaw.json（或 OPENCLAW_CONFIG_DIR 覆盖）
 */
function resolveConfigPath(): string {
  const override = process.env.OPENCLAW_CONFIG_DIR?.trim();
  const baseDir = override || path.join(os.homedir(), ".openclaw");
  return path.join(baseDir, "openclaw.json");
}

/**
 * 解析 auth-profiles.json 路径（CLI 存储 API Key 的标准位置）。
 * 路径：~/.openclaw/agents/main/agent/auth-profiles.json
 * 与 CLI 的 resolveOpenClawAgentDir() 保持一致。
 */
function resolveAuthProfilesPath(): string {
  const override = process.env.OPENCLAW_AGENT_DIR?.trim() ||
    process.env.PI_CODING_AGENT_DIR?.trim();
  const agentDir = override ??
    path.join(os.homedir(), ".openclaw", "agents", "main", "agent");
  return path.join(agentDir, "auth-profiles.json");
}

export interface OnboardingConfig {
  /** @deprecated Use resolvedModelId + authProviderGroup instead */
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
  /** Fully-qualified model id, e.g. "minimax/MiniMax-M2.5" */
  resolvedModelId?: string;
  /** Provider group id, e.g. "minimax" | "anthropic" | "openai" */
  authProviderGroup?: string;
  /** Auth method id, e.g. "apiKey" | "openai-api-key" */
  authMethod?: string;
  /** How API keys are persisted */
  secretInputMode?: "plaintext" | "ref";
}

// ─── Auth profiles store ────────────────────────────────────────────────────

/**
 * Write API key to ~/.openclaw/agents/main/agent/auth-profiles.json
 * using the same format as the CLI's saveAuthProfileStore().
 * This is the primary API key storage location — matching CLI standard.
 */
async function writeAuthProfile(params: {
  profileId: string;
  provider: string;
  apiKey: string;
}): Promise<void> {
  const authPath = resolveAuthProfilesPath();
  await fsp.mkdir(path.dirname(authPath), { recursive: true });

  let store: Record<string, unknown> = { version: 1, profiles: {} };
  try {
    store = JSON.parse(await fsp.readFile(authPath, "utf8")) as Record<string, unknown>;
    if (!store.profiles || typeof store.profiles !== "object") {
      store.profiles = {};
    }
  } catch {
    // File doesn't exist yet — start fresh
  }

  const profiles = store.profiles as Record<string, unknown>;
  profiles[params.profileId] = {
    type: "api_key",
    provider: params.provider,
    key: params.apiKey,
  };

  const tmpPath = `${authPath}.tmp`;
  await fsp.writeFile(tmpPath, JSON.stringify(store, null, 2), "utf8");
  await fsp.rename(tmpPath, authPath);

  console.log(`[onboarding] Auth profile saved to ${authPath}`);
}

// ─── Debug logging ───────────────────────────────────────────────────────────

const debugLogPath = path.join(os.homedir(), ".openclaw", "electron-onboarding.log");

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

// ─── Config builder ──────────────────────────────────────────────────────────

/**
 * Pure function: merges OnboardingConfig into an existing (possibly empty)
 * openclaw.json object and returns the full next config.
 *
 * Extracted so it can be unit-tested without filesystem side-effects.
 * To change provider metadata (baseUrl, models, env keys), edit
 * onboarding-providers.ts — no changes needed here.
 */
export function buildOpenClawConfig(
  cfg: OnboardingConfig,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  // ── 1. Resolve gateway token ──────────────────────────────────────────────
  const existingGw = existing.gateway as Record<string, unknown> | undefined;
  const existingGwAuth = existingGw?.auth as Record<string, unknown> | undefined;
  const existingToken =
    typeof existingGwAuth?.token === "string" && existingGwAuth.token.trim()
      ? existingGwAuth.token.trim()
      : null;
  const gatewayToken =
    existingToken ??
    (cfg.gatewayToken?.trim() || null) ??
    randomBytes(32).toString("hex");

  // ── 2. Resolve primary model id + env key ────────────────────────────────
  let primaryModelId: string;
  let provider: string;

  if (cfg.resolvedModelId?.trim()) {
    primaryModelId = cfg.resolvedModelId.trim();
    provider =
      cfg.authProviderGroup?.trim() ??
      primaryModelId.split("/")[0] ??
      "openai";
  } else {
    // Legacy fallback
    const legacy =
      LEGACY_MODEL_MAP[cfg.selectedModel] ?? LEGACY_MODEL_MAP["claude"];
    primaryModelId = legacy.resolvedModelId;
    provider = legacy.provider;
  }

  const envKey =
    PROVIDER_ENV_KEY_MAP[provider] ??
    `${provider.toUpperCase()}_API_KEY`;

  // modelId = the part after "provider/"
  const modelId = primaryModelId.includes("/")
    ? primaryModelId.split("/").slice(1).join("/")
    : primaryModelId;

  // ── 3. Build models.providers section ────────────────────────────────────
  const providerCfg = PROVIDER_REGISTRY[provider] ?? null;
  const existingModels = existing.models as Record<string, unknown> | undefined;
  const existingProviders =
    (existingModels?.providers as Record<string, unknown>) ?? {};

  const modelsSection: Record<string, unknown> = providerCfg
    ? {
        models: {
          ...existingModels,
          mode: existingModels?.mode ?? "merge",
          providers: {
            ...existingProviders,
            [provider]: {
              ...(existingProviders[provider] as Record<string, unknown> ?? {}),
              baseUrl: providerCfg.baseUrl,
              api: providerCfg.api,
              ...(providerCfg.authHeader ? { authHeader: true } : {}),
              models: providerCfg.models,
            },
          },
        },
      }
    : {};

  // ── 4. Build agents section ───────────────────────────────────────────────
  const existingAgents = existing.agents as Record<string, unknown> | undefined;
  const existingDefaults =
    existingAgents?.defaults as Record<string, unknown> | undefined;
  const existingAgentModels =
    existingDefaults?.models as Record<string, unknown> | undefined;

  const agentsSection = {
    ...existingAgents,
    defaults: {
      ...existingDefaults,
      workspace: cfg.workspace || "~/.openclaw/workspace",
      model: { primary: primaryModelId },
      // Register model alias so it shows up in the model picker
      models: {
        ...existingAgentModels,
        [primaryModelId]: {
          ...(existingAgentModels?.[primaryModelId] as Record<string, unknown> ?? {}),
          alias: modelId,
        },
      },
    },
  };

  // ── 5. Build auth.profiles section ───────────────────────────────────────
  const existingAuthSection =
    existing.auth as Record<string, unknown> | undefined;
  const authSection = {
    ...existingAuthSection,
    profiles: {
      ...((existingAuthSection?.profiles as Record<string, unknown>) ?? {}),
      [`${provider}:default`]: { provider, mode: "api_key" },
    },
  };

  // ── 6. Assemble final config ──────────────────────────────────────────────
  return {
    ...existing,
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
      port: cfg.gatewayPort ?? 18789,
      bind: cfg.gatewayBind ?? "loopback",
      auth: { mode: "token", token: gatewayToken },
    },
    agents: agentsSection,
    auth: authSection,
    ...modelsSection,
  };
}

// ─── Persist to disk ─────────────────────────────────────────────────────────

/**
 * Persist onboarding parameters to ~/.openclaw/openclaw.json.
 *
 * Config construction is handled by buildOpenClawConfig().
 * Provider metadata (baseUrl, models, env keys) lives in onboarding-providers.ts.
 */
export async function saveOnboardingConfig(
  cfg: OnboardingConfig,
): Promise<void> {
  const cfgPath = resolveConfigPath();
  await fsp.mkdir(path.dirname(cfgPath), { recursive: true });

  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await fsp.readFile(cfgPath, "utf8")) as Record<string, unknown>;
  } catch {
    // File doesn't exist yet — start fresh
  }

  const nextConfig = buildOpenClawConfig(cfg, existing);

  // Write API key to auth-profiles.json (CLI standard — not openclaw.json env section)
  if (cfg.apiKey?.trim()) {
    const provider =
      cfg.authProviderGroup?.trim() ??
      (cfg.resolvedModelId?.trim()
        ? cfg.resolvedModelId.trim().split("/")[0]
        : null) ??
      (LEGACY_MODEL_MAP[cfg.selectedModel]?.provider) ??
      "openai";
    await writeAuthProfile({
      profileId: `${provider}:default`,
      provider,
      apiKey: cfg.apiKey.trim(),
    });
  }

  const tmpPath = `${cfgPath}.tmp`;
  await fsp.writeFile(tmpPath, JSON.stringify(nextConfig, null, 2), "utf8");
  await fsp.rename(tmpPath, cfgPath);

  console.log(`[onboarding] Config saved to ${cfgPath}`);
}

// ─── First-launch detection ───────────────────────────────────────────────────

/**
 * 检测是否为首次启动（未完成配置）。
 * 与 macOS shouldSkipWizard() 逻辑对齐：
 *   - wizard.lastRunAt 存在 → 已完成
 *   - gateway.auth.mode / token / password 任一有值 → 已完成
 *   - gateway.mode 为 "local" 或 "remote" → 已完成
 */
export function isFirstLaunch(): boolean {
  const cfgPath = resolveConfigPath();
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as Record<string, unknown>;

    const wizard = cfg?.wizard as Record<string, unknown> | undefined;
    if (typeof wizard?.lastRunAt === "string" && wizard.lastRunAt.trim()) {
      return false;
    }

    const gateway = cfg?.gateway as Record<string, unknown> | undefined;
    const auth = gateway?.auth as Record<string, unknown> | undefined;
    if (auth) {
      const hasMode = typeof auth.mode === "string" && auth.mode.trim().length > 0;
      const hasToken = typeof auth.token === "string" && auth.token.trim().length > 0;
      const hasPassword = typeof auth.password === "string" && auth.password.trim().length > 0;
      if (hasMode || hasToken || hasPassword) return false;
    }

    const gatewayMode = gateway?.mode;
    if (gatewayMode === "local" || gatewayMode === "remote") return false;

    return true;
  } catch {
    return true;
  }
}
