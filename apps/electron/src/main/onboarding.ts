import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";
import {
  PROVIDER_REGISTRY,
  OAUTH_AUTH_METHODS,
  OAUTH_METHOD_PLUGIN,
  OAUTH_METHOD_PROVIDER_OVERRIDE,
  OAUTH_METHOD_BASE_URL_OVERRIDE,
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
  const override =
    process.env.OPENCLAW_AGENT_DIR?.trim() ||
    process.env.PI_CODING_AGENT_DIR?.trim();
  const agentDir =
    override ?? path.join(os.homedir(), ".openclaw", "agents", "main", "agent");
  return path.join(agentDir, "auth-profiles.json");
}

export interface OnboardingConfig {
  /** Plaintext API key entered by the user, or OAuth access token */
  apiKey: string;
  /** For OAuth flows: the refresh token */
  oauthRefresh?: string;
  /** For OAuth flows: token expiry (unix timestamp ms) */
  oauthExpires?: number;
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
  /** Fully-qualified model id, e.g. "minimax/MiniMax-M2.7" */
  resolvedModelId?: string;
  /** Provider group id, e.g. "minimax" | "anthropic" | "openai" */
  authProviderGroup?: string;
  /** Auth method id, e.g. "apiKey" | "openai-api-key" */
  authMethod?: string;
  /** How API keys are persisted */
  secretInputMode?: "plaintext" | "ref";
  /** From invite code: Brave Search API key (written to tools.web.search.apiKey) */
  braveApiKey?: string;
  /** From invite code: Amap (高德) LBS API key (written to skills.entries.amap-lbs-skill.apiKey) */
  amapApiKey?: string;
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
  mode?: "api_key" | "oauth";
  oauthExtra?: { refresh?: string; expires?: number };
}): Promise<void> {
  const authPath = resolveAuthProfilesPath();
  await fsp.mkdir(path.dirname(authPath), { recursive: true });

  let store: Record<string, unknown> = { version: 1, profiles: {} };
  try {
    store = JSON.parse(await fsp.readFile(authPath, "utf8")) as Record<
      string,
      unknown
    >;
    if (!store.profiles || typeof store.profiles !== "object") {
      store.profiles = {};
    }
  } catch {
    // File doesn't exist yet — start fresh
  }

  const profiles = store.profiles as Record<string, unknown>;
  const profileMode = params.mode ?? "api_key";

  if (profileMode === "oauth") {
    // Match CLI's AuthProfileCredential format exactly (from buildOauthProviderAuthResult)
    profiles[params.profileId] = {
      type: "oauth",
      provider: params.provider,
      access: params.apiKey,
      ...(params.oauthExtra?.refresh
        ? { refresh: params.oauthExtra.refresh }
        : {}),
      ...(Number.isFinite(params.oauthExtra?.expires)
        ? { expires: params.oauthExtra!.expires }
        : {}),
    };
  } else {
    profiles[params.profileId] = {
      type: "api_key",
      provider: params.provider,
      key: params.apiKey,
    };
  }

  const tmpPath = `${authPath}.tmp`;
  await fsp.writeFile(tmpPath, JSON.stringify(store, null, 2), "utf8");
  await fsp.rename(tmpPath, authPath);

  console.log(
    `[onboarding] Auth profile "${params.profileId}" (mode=${profileMode}) saved to ${authPath}`,
  );
}

// ─── Debug logging ───────────────────────────────────────────────────────────

/** 主进程统一日志文件：~/.openclaw/electron-main.log */
export const MAIN_LOG_PATH = path.join(
  os.homedir(),
  ".openclaw",
  "logs/electron-main.log",
);

/** 日志轮转阈值：5 MB */
const LOG_ROTATE_BYTES = 5 * 1024 * 1024;

/**
 * 写日志到 ~/.openclaw/logs/electron-main.log（同步，避免异步竞态）。
 * 打包后 stdout/stderr 不可见，必须落文件才能排查黑屏问题。
 * 文件超过 5 MB 时轮转：重命名为 .1（覆盖旧备份），然后写新文件。
 * 只保留最近 2 个文件，无需额外依赖。
 */
export function mainLogSync(message: string): void {
  try {
    const dir = path.dirname(MAIN_LOG_PATH);
    fs.mkdirSync(dir, { recursive: true });
    // Rotate if current log exceeds threshold.
    try {
      const stat = fs.statSync(MAIN_LOG_PATH);
      if (stat.size >= LOG_ROTATE_BYTES) {
        const rotated = `${MAIN_LOG_PATH}.1`;
        fs.renameSync(MAIN_LOG_PATH, rotated);
      }
    } catch {
      // File may not exist yet — ignore.
    }
    const line = `${new Date().toISOString()} ${message}\n`;
    fs.appendFileSync(MAIN_LOG_PATH, line, "utf8");
  } catch {
    // never throw from logging
  }
}

/** 异步版本（兼容旧调用） */
export async function writeDebugLog(message: string): Promise<void> {
  mainLogSync(message);
}

/** 日志路径（onboarding.log 保留作别名，指向同一文件） */
export const debugLogPath = MAIN_LOG_PATH;

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
  const existingGwAuth = existingGw?.auth as
    | Record<string, unknown>
    | undefined;
  const existingToken =
    typeof existingGwAuth?.token === "string" && existingGwAuth.token.trim()
      ? existingGwAuth.token.trim()
      : null;
  const gatewayToken =
    existingToken ??
    (cfg.gatewayToken?.trim() || null) ??
    randomBytes(32).toString("hex");

  // ── 2. Resolve primary model id + env key ────────────────────────────────
  // resolvedModelId is required; selectedModel (legacy) is no longer supported.
  const rawModelId = cfg.resolvedModelId?.trim() || "anthropic/claude-opus-4-6";

  // OAuth plugin methods use a different provider id than the authProviderGroup.
  // e.g. "minimax-portal" and "minimax-portal-cn" both use provider "minimax-portal".
  // We must rewrite the model id prefix to match the plugin provider id.
  // Source of truth: OAUTH_METHOD_PROVIDER_OVERRIDE in onboarding-providers.ts.
  const providerFromMethod = cfg.authMethod
    ? OAUTH_METHOD_PROVIDER_OVERRIDE[cfg.authMethod]
    : undefined;

  const provider =
    providerFromMethod ??
    cfg.authProviderGroup?.trim() ??
    rawModelId.split("/")[0] ??
    "openai";

  // Rewrite model id prefix to match the resolved provider id.
  // e.g. "minimax-cn/MiniMax-M2.7" → "minimax-portal/MiniMax-M2.7" when provider="minimax-portal"
  const rawModelPrefix = rawModelId.includes("/")
    ? rawModelId.split("/")[0]
    : null;
  const primaryModelId =
    rawModelPrefix && rawModelPrefix !== provider
      ? `${provider}/${rawModelId.split("/").slice(1).join("/")}`
      : rawModelId;

  // modelId = the part after "provider/"
  const modelId = primaryModelId.includes("/")
    ? primaryModelId.split("/").slice(1).join("/")
    : primaryModelId;

  // ── 3. Build models.providers section ────────────────────────────────────
  // For MiniMax OAuth CN, use the CN endpoint even though provider is "minimax-portal".
  // Source of truth: OAUTH_METHOD_BASE_URL_OVERRIDE in onboarding-providers.ts.
  const providerBaseUrlOverride = cfg.authMethod
    ? OAUTH_METHOD_BASE_URL_OVERRIDE[cfg.authMethod]
    : undefined;

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
              ...((existingProviders[provider] as Record<string, unknown>) ??
                {}),
              baseUrl: providerBaseUrlOverride ?? providerCfg.baseUrl,
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
  const existingDefaults = existingAgents?.defaults as
    | Record<string, unknown>
    | undefined;
  const existingAgentModels = existingDefaults?.models as
    | Record<string, unknown>
    | undefined;

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
          ...((existingAgentModels?.[primaryModelId] as Record<
            string,
            unknown
          >) ?? {}),
          alias: modelId,
        },
      },
    },
  };

  // ── 5. Build auth.profiles section ───────────────────────────────────────
  // OAuth methods need mode: "oauth" (not "api_key") and plugin entry enabled.
  // Source of truth: OAUTH_AUTH_METHODS Set in onboarding-providers.ts.
  const isOAuthMethod = OAUTH_AUTH_METHODS.has(cfg.authMethod ?? "");

  const existingAuthSection = existing.auth as
    | Record<string, unknown>
    | undefined;
  const authSection = {
    ...existingAuthSection,
    profiles: {
      ...((existingAuthSection?.profiles as Record<string, unknown>) ?? {}),
      [`${provider}:default`]: isOAuthMethod
        ? { provider, mode: "oauth" }
        : { provider, mode: "api_key" },
    },
  };

  // ── 5b. Build plugins section for OAuth providers ────────────────────────
  // Source of truth: OAUTH_METHOD_PLUGIN in onboarding-providers.ts.
  const pluginId = cfg.authMethod
    ? OAUTH_METHOD_PLUGIN[cfg.authMethod]
    : undefined;
  const existingPlugins = existing.plugins as
    | Record<string, unknown>
    | undefined;
  const existingPluginEntries =
    (existingPlugins?.entries as Record<string, unknown>) ?? {};
  const pluginsSection = pluginId
    ? {
        plugins: {
          ...existingPlugins,
          entries: {
            ...existingPluginEntries,
            [pluginId]: { enabled: true },
          },
        },
      }
    : {};

  // ── 7. Build tools section (from invite-code data) ───────────────────────
  const existingTools = existing.tools as Record<string, unknown> | undefined;
  const existingToolsWeb = existingTools?.web as
    | Record<string, unknown>
    | undefined;
  const toolsSection: Record<string, unknown> = cfg.braveApiKey
    ? {
        tools: {
          ...existingTools,
          web: {
            ...existingToolsWeb,
            search: {
              enabled: true,
              provider: "brave",
              apiKey: cfg.braveApiKey,
              ...(existingToolsWeb?.search as Record<string, unknown>),
            },
          },
        },
      }
    : {};

  // ── 8. Build skills section (from invite-code data) ───────────────────────
  const existingSkills = existing.skills as Record<string, unknown> | undefined;
  const existingSkillEntries =
    (existingSkills?.entries as Record<string, unknown>) ?? {};
  const skillsSection: Record<string, unknown> = cfg.amapApiKey
    ? {
        skills: {
          ...existingSkills,
          entries: {
            "amap-lbs-skill": { apiKey: cfg.amapApiKey },
            ...existingSkillEntries,
          },
        },
      }
    : {};

  // ── 6. Assemble final config ──────────────────────────────────────────────
  // Strip plugins.slots from existing config to avoid stale/invalid plugin
  // references (e.g. memory-core) that would cause Gateway startup failure.
  const existingWithoutPluginSlots = { ...existing } as Record<string, unknown>;
  if (existingPlugins) {
    const { slots: _slots, ...pluginsWithoutSlots } = existingPlugins as Record<
      string,
      unknown
    >;
    existingWithoutPluginSlots.plugins = pluginsWithoutSlots;
  }

  return {
    ...existingWithoutPluginSlots,
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
      controlUi: {
        ...((existingGw?.controlUi as Record<string, unknown>) ?? {}),
        // Allow Electron renderer (file:// with injected loopback Origin) to connect.
        allowedOrigins: [
          `http://127.0.0.1:${cfg.gatewayPort ?? 18789}`,
          `http://localhost:${cfg.gatewayPort ?? 18789}`,
          `file://`,
        ],
      },
    },
    agents: agentsSection,
    auth: authSection,
    ...modelsSection,
    ...pluginsSection,
    ...toolsSection,
    ...skillsSection,
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
    existing = JSON.parse(await fsp.readFile(cfgPath, "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    // File doesn't exist yet — start fresh
  }

  const nextConfig = buildOpenClawConfig(cfg, existing);

  // Write API key / OAuth token to auth-profiles.json (CLI standard).
  // Uses the same constants as buildOpenClawConfig — single source of truth.
  const isOAuthMethod = OAUTH_AUTH_METHODS.has(cfg.authMethod ?? "");

  const resolvedProvider =
    (cfg.authMethod
      ? OAUTH_METHOD_PROVIDER_OVERRIDE[cfg.authMethod]
      : undefined) ??
    cfg.authProviderGroup?.trim() ??
    (cfg.resolvedModelId?.trim()
      ? cfg.resolvedModelId.trim().split("/")[0]
      : null) ??
    "openai";

  if (isOAuthMethod) {
    // OAuth: write token to auth-profiles.json so the plugin can pick it up.
    // Must match CLI's AuthProfileCredential format: access/refresh/expires (not "key").
    if (cfg.apiKey?.trim()) {
      await writeAuthProfile({
        profileId: `${resolvedProvider}:default`,
        provider: resolvedProvider,
        apiKey: cfg.apiKey.trim(),
        mode: "oauth",
        oauthExtra: {
          refresh: cfg.oauthRefresh,
          expires: cfg.oauthExpires,
        },
      });
    } else {
      console.log(
        `[onboarding] OAuth method "${cfg.authMethod ?? ""}": no token yet, skipping auth-profiles write`,
      );
    }
  } else if (cfg.apiKey?.trim()) {
    // API key: write in standard api_key format.
    await writeAuthProfile({
      profileId: `${resolvedProvider}:default`,
      provider: resolvedProvider,
      apiKey: cfg.apiKey.trim(),
    });
  } else {
    console.warn(
      `[onboarding] No apiKey provided for method "${cfg.authMethod ?? ""}", skipping auth-profiles write`,
    );
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
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as Record<
      string,
      unknown
    >;

    const wizard = cfg?.wizard as Record<string, unknown> | undefined;
    if (typeof wizard?.lastRunAt === "string" && wizard.lastRunAt.trim()) {
      return false;
    }

    const gateway = cfg?.gateway as Record<string, unknown> | undefined;
    const auth = gateway?.auth as Record<string, unknown> | undefined;
    if (auth) {
      const hasMode =
        typeof auth.mode === "string" && auth.mode.trim().length > 0;
      const hasToken =
        typeof auth.token === "string" && auth.token.trim().length > 0;
      const hasPassword =
        typeof auth.password === "string" && auth.password.trim().length > 0;
      if (hasMode || hasToken || hasPassword) return false;
    }

    const gatewayMode = gateway?.mode;
    if (gatewayMode === "local" || gatewayMode === "remote") return false;

    return true;
  } catch {
    return true;
  }
}
