/**
 * onboarding-providers.ts
 *
 * Provider registry for Electron onboarding config generation.
 * Mirrors the CLI's onboard-auth.config-*.ts and onboard-auth.models.ts.
 *
 * To add/update a provider:
 *   1. Add/edit the entry in PROVIDER_REGISTRY below.
 *   2. If the new auth method is OAuth, add its id to OAUTH_AUTH_METHODS.
 *   3. No other files need to change.
 *
 * NOTE: secretInputMode="ref" (env-var reference) is not yet implemented.
 * When implemented, use AuthMethodDef.envVar from auth-choice-groups.ts
 * as the source of truth for env-var names (do not add a local PROVIDER_ENV_KEY_MAP).
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type ModelCost = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

export type ModelEntry = {
  id: string;
  name?: string;
  reasoning?: boolean;
  input?: string[];
  cost?: ModelCost;
  contextWindow?: number;
  maxTokens?: number;
};

/**
 * Per-provider API config written to models.providers in openclaw.json.
 * Must include a non-empty `models` array (Gateway schema requirement).
 */
export type ProviderApiConfig = {
  /** Full base URL for the provider API */
  baseUrl: string;
  /** API protocol: "anthropic-messages" | "openai-completions" | ... */
  api: string;
  /** Set to true when the provider uses Authorization header (not Bearer) */
  authHeader?: boolean;
  /** Model catalog — at least one entry required by Gateway schema */
  models: ModelEntry[];
};

// ─── Shared cost tables ───────────────────────────────────────────────────────

const FREE_COST: ModelCost = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

const MINIMAX_API_COST: ModelCost = {
  input: 0.3,
  output: 1.2,
  cacheRead: 0.03,
  cacheWrite: 0.12,
};

// ─── Shared model lists ───────────────────────────────────────────────────────
// Extracted to avoid duplication between registry keys that share the same models.

// const MINIMAX_M25_MODELS: ModelEntry[] = [
//   {
//     id: "MiniMax-M2.7",
//     name: "MiniMax M2.7",
//     reasoning: true,
//     input: ["text"],
//     cost: MINIMAX_API_COST,
//     contextWindow: 200000,
//     maxTokens: 8192,
//   },
//   {
//     id: "MiniMax-M2.7-highspeed",
//     name: "MiniMax M2.7 Highspeed",
//     reasoning: true,
//     input: ["text"],
//     cost: MINIMAX_API_COST,
//     contextWindow: 200000,
//     maxTokens: 8192,
//   },
//   {
//     id: "MiniMax-M2.7-Lightning",
//     name: "MiniMax M2.7 Lightning",
//     reasoning: false,
//     input: ["text"],
//     cost: MINIMAX_API_COST,
//     contextWindow: 200000,
//     maxTokens: 8192,
//   },
// ];

const MINIMAX_M27_MODELS: ModelEntry[] = [
  {
    id: "MiniMax-M2.7",
    name: "MiniMax M2.7",
    reasoning: true,
    input: ["text"],
    cost: MINIMAX_API_COST,
    contextWindow: 200000,
    maxTokens: 8192,
  },
  {
    id: "MiniMax-M2.7-highspeed",
    name: "MiniMax M2.7 Highspeed",
    reasoning: true,
    input: ["text"],
    cost: MINIMAX_API_COST,
    contextWindow: 200000,
    maxTokens: 8192,
  },
  {
    id: "MiniMax-M2.7-Lightning",
    name: "MiniMax M2.7 Lightning",
    reasoning: false,
    input: ["text"],
    cost: MINIMAX_API_COST,
    contextWindow: 200000,
    maxTokens: 8192,
  },
];

// ─── OAuth auth method ids ────────────────────────────────────────────────────
//
// Single source of truth for which auth method ids use OAuth flow.
// Used by onboarding.ts (isOAuthMethod), oauth handler, and config builder.
// When adding a new OAuth method, add its id here — no other files need changing.

export const OAUTH_AUTH_METHODS = new Set<string>([
  "token", // Anthropic setup-token
  "openai-codex", // OpenAI Codex (ChatGPT OAuth)
  "google-gemini-cli", // Google Gemini CLI OAuth
  "minimax-portal", // MiniMax OAuth (Global)
  "minimax-portal-cn", // MiniMax OAuth (CN)
  "qwen-portal", // Qwen OAuth
  "github-copilot", // GitHub Copilot device flow
  "chutes", // Chutes OAuth
]);

// ─── OAuth plugin map ─────────────────────────────────────────────────────────
//
// Maps OAuth auth method id → plugin id that must be enabled in openclaw.json.
// Only methods that require a dedicated plugin appear here.

export const OAUTH_METHOD_PLUGIN: Record<string, string> = {
  "minimax-portal": "minimax-portal-auth",
  "minimax-portal-cn": "minimax-portal-auth",
};

// ─── OAuth provider override map ─────────────────────────────────────────────
//
// Some OAuth methods resolve to a different provider key than their group id.
// e.g. both minimax-portal and minimax-portal-cn write config under "minimax-portal".
// This is the single source of truth — previously duplicated in onboarding.ts.

export const OAUTH_METHOD_PROVIDER_OVERRIDE: Record<string, string> = {
  "minimax-portal": "minimax-portal",
  "minimax-portal-cn": "minimax-portal",
};

// ─── OAuth base URL override map ─────────────────────────────────────────────
//
// Some OAuth methods share a provider key but need a different base URL.
// e.g. minimax-portal-cn uses the CN endpoint despite provider="minimax-portal".

export const OAUTH_METHOD_BASE_URL_OVERRIDE: Record<string, string> = {
  "minimax-portal-cn": "https://api.minimaxi.com/anthropic",
};

// ─── Provider registry ───────────────────────────────────────────────────────
//
// Keys are provider IDs as used in resolvedModelId (e.g. "minimax/MiniMax-M2.7").
// Providers handled natively by the Gateway (anthropic, openai, google) don't
// need an entry here — the Gateway knows their endpoints internally.

export const PROVIDER_REGISTRY: Record<string, ProviderApiConfig> = {
  // ── MiniMax (global, API key) ─────────────────────────────────────────────
  minimax: {
    baseUrl: "https://api.minimax.io/anthropic",
    api: "anthropic-messages",
    authHeader: true,
    models: MINIMAX_M27_MODELS,
  },

  // ── MiniMax OAuth plugin (Global) — provider id used by minimax-portal-auth ──
  // Shares the same endpoint and models as `minimax`; extracted to avoid drift.
  "minimax-portal": {
    baseUrl: "https://api.minimax.io/anthropic",
    api: "anthropic-messages",
    authHeader: true,
    models: MINIMAX_M27_MODELS,
  },

  // ── MiniMax (China) ───────────────────────────────────────────────────────
  // CN endpoint; OAUTH_METHOD_BASE_URL_OVERRIDE handles the portal-cn case.
  "minimax-cn": {
    baseUrl: "https://api.minimaxi.com/anthropic",
    api: "anthropic-messages",
    authHeader: true,
    models: MINIMAX_M27_MODELS,
  },

  // ── Mistral ───────────────────────────────────────────────────────────────
  mistral: {
    baseUrl: "https://api.mistral.ai/v1",
    api: "openai-completions",
    models: [
      {
        id: "mistral-large-latest",
        name: "Mistral Large 2411",
        reasoning: false,
        input: ["text"],
        cost: FREE_COST,
        contextWindow: 131072,
        maxTokens: 8192,
      },
      {
        id: "mistral-small-latest",
        name: "Mistral Small 3.1",
        reasoning: false,
        input: ["text"],
        cost: FREE_COST,
        contextWindow: 131072,
        maxTokens: 8192,
      },
    ],
  },

  // ── xAI (Grok) ────────────────────────────────────────────────────────────
  xai: {
    baseUrl: "https://api.x.ai/v1",
    api: "openai-completions",
    models: [
      {
        id: "grok-3",
        name: "Grok 3",
        reasoning: false,
        input: ["text"],
        cost: FREE_COST,
        contextWindow: 131072,
        maxTokens: 8192,
      },
      {
        id: "grok-3-mini",
        name: "Grok 3 Mini",
        reasoning: true,
        input: ["text"],
        cost: FREE_COST,
        contextWindow: 131072,
        maxTokens: 8192,
      },
    ],
  },

  // ── Moonshot / Kimi (global) ──────────────────────────────────────────────
  moonshot: {
    baseUrl: "https://api.moonshot.ai/v1",
    api: "openai-completions",
    models: [
      {
        id: "kimi-k2.5",
        name: "Kimi K2.5",
        reasoning: false,
        input: ["text", "image"],
        cost: FREE_COST,
        contextWindow: 256000,
        maxTokens: 4096,
      },
    ],
  },

  // ── Moonshot / Kimi (China alias) ─────────────────────────────────────────
  "moonshot-cn": {
    baseUrl: "https://api.moonshot.cn/v1",
    api: "openai-completions",
    models: [
      {
        id: "kimi-k2.5",
        name: "Kimi K2.5",
        reasoning: false,
        input: ["text", "image"],
        cost: FREE_COST,
        contextWindow: 256000,
        maxTokens: 4096,
      },
    ],
  },

  // ── OpenRouter ────────────────────────────────────────────────────────────
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    api: "openai-completions",
    models: [
      {
        id: "anthropic/claude-opus-4-6",
        name: "Claude Opus 4.6",
        reasoning: false,
        input: ["text"],
        cost: FREE_COST,
        contextWindow: 200000,
        maxTokens: 8192,
      },
      {
        id: "openai/gpt-4o",
        name: "GPT-4o",
        reasoning: false,
        input: ["text"],
        cost: FREE_COST,
        contextWindow: 128000,
        maxTokens: 8192,
      },
      {
        id: "google/gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        reasoning: false,
        input: ["text"],
        cost: FREE_COST,
        contextWindow: 128000,
        maxTokens: 8192,
      },
    ],
  },

  // ── Groq ──────────────────────────────────────────────────────────────────
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    api: "openai-completions",
    models: [
      {
        id: "llama-3.3-70b-versatile",
        name: "Llama 3.3 70B",
        reasoning: false,
        input: ["text"],
        cost: FREE_COST,
        contextWindow: 128000,
        maxTokens: 8192,
      },
      {
        id: "llama-3.1-8b-instant",
        name: "Llama 3.1 8B",
        reasoning: false,
        input: ["text"],
        cost: FREE_COST,
        contextWindow: 128000,
        maxTokens: 8192,
      },
    ],
  },

  // ── DeepSeek ──────────────────────────────────────────────────────────────
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    api: "openai-completions",
    models: [
      {
        id: "deepseek-chat",
        name: "DeepSeek V3",
        reasoning: false,
        input: ["text"],
        cost: FREE_COST,
        contextWindow: 65536,
        maxTokens: 8192,
      },
      {
        id: "deepseek-reasoner",
        name: "DeepSeek R1",
        reasoning: true,
        input: ["text"],
        cost: FREE_COST,
        contextWindow: 65536,
        maxTokens: 8192,
      },
    ],
  },

  // ── Together AI ───────────────────────────────────────────────────────────
  together: {
    baseUrl: "https://api.together.xyz/v1",
    api: "openai-completions",
    models: [
      {
        id: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
        name: "Llama 3.1 70B",
        reasoning: false,
        input: ["text"],
        cost: FREE_COST,
        contextWindow: 131072,
        maxTokens: 8192,
      },
    ],
  },

  // ── Perplexity ────────────────────────────────────────────────────────────
  perplexity: {
    baseUrl: "https://api.perplexity.ai",
    api: "openai-completions",
    models: [
      {
        id: "sonar",
        name: "Sonar",
        reasoning: false,
        input: ["text"],
        cost: FREE_COST,
        contextWindow: 128000,
        maxTokens: 8192,
      },
      {
        id: "sonar-pro",
        name: "Sonar Pro",
        reasoning: false,
        input: ["text"],
        cost: FREE_COST,
        contextWindow: 128000,
        maxTokens: 8192,
      },
    ],
  },

  // ── Zhipu (GLM) ───────────────────────────────────────────────────────────
  zhipu: {
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    api: "openai-completions",
    models: [
      {
        id: "glm-4",
        name: "GLM-4",
        reasoning: false,
        input: ["text"],
        cost: FREE_COST,
        contextWindow: 128000,
        maxTokens: 8192,
      },
      {
        id: "glm-4-flash",
        name: "GLM-4 Flash",
        reasoning: false,
        input: ["text"],
        cost: FREE_COST,
        contextWindow: 128000,
        maxTokens: 8192,
      },
    ],
  },

  // ── Moonshot Kimi (coding) ────────────────────────────────────────────────
  "kimi-coding": {
    baseUrl: "https://api.kimi.com/coding/",
    api: "anthropic-messages",
    models: [
      {
        id: "kimi-coding",
        name: "Kimi for Coding",
        reasoning: false,
        input: ["text"],
        cost: FREE_COST,
        contextWindow: 200000,
        maxTokens: 8192,
      },
    ],
  },
};
