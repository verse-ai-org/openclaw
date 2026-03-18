/**
 * onboarding-providers.ts
 *
 * Provider registry for Electron onboarding config generation.
 * Mirrors the CLI's onboard-auth.config-*.ts and onboard-auth.models.ts.
 *
 * To add/update a provider:
 *   1. Add/edit the entry in PROVIDER_REGISTRY below.
 *   2. Add the env-var key in PROVIDER_ENV_KEY_MAP if not already present.
 *   3. No other files need to change.
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

const FREE_COST: ModelCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

const MINIMAX_API_COST: ModelCost = { input: 0.3, output: 1.2, cacheRead: 0.03, cacheWrite: 0.12 };

// ─── Provider registry ───────────────────────────────────────────────────────
//
// Keys are provider IDs as used in resolvedModelId (e.g. "minimax/MiniMax-M2.5").
// Providers handled natively by the Gateway (anthropic, openai, google) don't
// need an entry here — the Gateway knows their endpoints internally.

export const PROVIDER_REGISTRY: Record<string, ProviderApiConfig> = {
  // ── MiniMax (global) ──────────────────────────────────────────────────────
  minimax: {
    baseUrl: "https://api.minimax.io/anthropic",
    api: "anthropic-messages",
    authHeader: true,
    models: [
      { id: "MiniMax-M2.5",           name: "MiniMax M2.5",           reasoning: true,  input: ["text"], cost: MINIMAX_API_COST, contextWindow: 200000, maxTokens: 8192 },
      { id: "MiniMax-M2.5-highspeed", name: "MiniMax M2.5 Highspeed", reasoning: true,  input: ["text"], cost: MINIMAX_API_COST, contextWindow: 200000, maxTokens: 8192 },
      { id: "MiniMax-M2.5-Lightning", name: "MiniMax M2.5 Lightning", reasoning: false, input: ["text"], cost: MINIMAX_API_COST, contextWindow: 200000, maxTokens: 8192 },
    ],
  },

  // ── MiniMax OAuth plugin (Global) — provider id used by minimax-portal-auth ──
  "minimax-portal": {
    baseUrl: "https://api.minimax.io/anthropic",
    api: "anthropic-messages",
    authHeader: true,
    models: [
      { id: "MiniMax-M2.5",           name: "MiniMax M2.5",           reasoning: true,  input: ["text"], cost: MINIMAX_API_COST, contextWindow: 200000, maxTokens: 8192 },
      { id: "MiniMax-M2.5-highspeed", name: "MiniMax M2.5 Highspeed", reasoning: true,  input: ["text"], cost: MINIMAX_API_COST, contextWindow: 200000, maxTokens: 8192 },
      { id: "MiniMax-M2.5-Lightning", name: "MiniMax M2.5 Lightning", reasoning: false, input: ["text"], cost: MINIMAX_API_COST, contextWindow: 200000, maxTokens: 8192 },
    ],
  },

  // ── MiniMax (China) ───────────────────────────────────────────────────────
  "minimax-cn": {
    baseUrl: "https://api.minimaxi.com/anthropic",
    api: "anthropic-messages",
    authHeader: true,
    models: [
      { id: "MiniMax-M2.5",           name: "MiniMax M2.5",           reasoning: true,  input: ["text"], cost: MINIMAX_API_COST, contextWindow: 200000, maxTokens: 8192 },
      { id: "MiniMax-M2.5-highspeed", name: "MiniMax M2.5 Highspeed", reasoning: true,  input: ["text"], cost: MINIMAX_API_COST, contextWindow: 200000, maxTokens: 8192 },
      { id: "MiniMax-M2.5-Lightning", name: "MiniMax M2.5 Lightning", reasoning: false, input: ["text"], cost: MINIMAX_API_COST, contextWindow: 200000, maxTokens: 8192 },
    ],
  },

  // ── Mistral ───────────────────────────────────────────────────────────────
  mistral: {
    baseUrl: "https://api.mistral.ai/v1",
    api: "openai-completions",
    models: [
      { id: "mistral-large-latest",  name: "Mistral Large 2411", reasoning: false, input: ["text"], cost: FREE_COST, contextWindow: 131072, maxTokens: 8192 },
      { id: "mistral-small-latest",  name: "Mistral Small 3.1",  reasoning: false, input: ["text"], cost: FREE_COST, contextWindow: 131072, maxTokens: 8192 },
    ],
  },

  // ── xAI (Grok) ────────────────────────────────────────────────────────────
  xai: {
    baseUrl: "https://api.x.ai/v1",
    api: "openai-completions",
    models: [
      { id: "grok-3",       name: "Grok 3",       reasoning: false, input: ["text"], cost: FREE_COST, contextWindow: 131072, maxTokens: 8192 },
      { id: "grok-3-mini",  name: "Grok 3 Mini",  reasoning: true,  input: ["text"], cost: FREE_COST, contextWindow: 131072, maxTokens: 8192 },
    ],
  },

  // ── Moonshot / Kimi (global) ──────────────────────────────────────────────
  moonshot: {
    baseUrl: "https://api.moonshot.ai/v1",
    api: "openai-completions",
    models: [
      { id: "kimi-k2.5", name: "Kimi K2.5", reasoning: false, input: ["text", "image"], cost: FREE_COST, contextWindow: 256000, maxTokens: 4096 },
    ],
  },

  // ── Moonshot / Kimi (China alias) ─────────────────────────────────────────
  "moonshot-cn": {
    baseUrl: "https://api.moonshot.cn/v1",
    api: "openai-completions",
    models: [
      { id: "kimi-k2.5", name: "Kimi K2.5", reasoning: false, input: ["text", "image"], cost: FREE_COST, contextWindow: 256000, maxTokens: 4096 },
    ],
  },

  // ── OpenRouter ────────────────────────────────────────────────────────────
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    api: "openai-completions",
    models: [
      { id: "anthropic/claude-opus-4-6",        name: "Claude Opus 4.6",   reasoning: false, input: ["text"], cost: FREE_COST, contextWindow: 200000, maxTokens: 8192 },
      { id: "openai/gpt-4o",                    name: "GPT-4o",            reasoning: false, input: ["text"], cost: FREE_COST, contextWindow: 128000, maxTokens: 8192 },
      { id: "google/gemini-2.0-flash",          name: "Gemini 2.0 Flash",  reasoning: false, input: ["text"], cost: FREE_COST, contextWindow: 128000, maxTokens: 8192 },
    ],
  },

  // ── Groq ──────────────────────────────────────────────────────────────────
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    api: "openai-completions",
    models: [
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", reasoning: false, input: ["text"], cost: FREE_COST, contextWindow: 128000, maxTokens: 8192 },
      { id: "llama-3.1-8b-instant",    name: "Llama 3.1 8B",  reasoning: false, input: ["text"], cost: FREE_COST, contextWindow: 128000, maxTokens: 8192 },
    ],
  },

  // ── DeepSeek ──────────────────────────────────────────────────────────────
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    api: "openai-completions",
    models: [
      { id: "deepseek-chat",    name: "DeepSeek V3",    reasoning: false, input: ["text"], cost: FREE_COST, contextWindow: 65536,  maxTokens: 8192 },
      { id: "deepseek-reasoner",name: "DeepSeek R1",    reasoning: true,  input: ["text"], cost: FREE_COST, contextWindow: 65536,  maxTokens: 8192 },
    ],
  },

  // ── Together AI ───────────────────────────────────────────────────────────
  together: {
    baseUrl: "https://api.together.xyz/v1",
    api: "openai-completions",
    models: [
      { id: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", name: "Llama 3.1 70B", reasoning: false, input: ["text"], cost: FREE_COST, contextWindow: 131072, maxTokens: 8192 },
    ],
  },

  // ── Perplexity ────────────────────────────────────────────────────────────
  perplexity: {
    baseUrl: "https://api.perplexity.ai",
    api: "openai-completions",
    models: [
      { id: "sonar",        name: "Sonar",         reasoning: false, input: ["text"], cost: FREE_COST, contextWindow: 128000, maxTokens: 8192 },
      { id: "sonar-pro",    name: "Sonar Pro",      reasoning: false, input: ["text"], cost: FREE_COST, contextWindow: 128000, maxTokens: 8192 },
    ],
  },

  // ── Zhipu (GLM) ───────────────────────────────────────────────────────────
  zhipu: {
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    api: "openai-completions",
    models: [
      { id: "glm-4",       name: "GLM-4",       reasoning: false, input: ["text"], cost: FREE_COST, contextWindow: 128000, maxTokens: 8192 },
      { id: "glm-4-flash", name: "GLM-4 Flash", reasoning: false, input: ["text"], cost: FREE_COST, contextWindow: 128000, maxTokens: 8192 },
    ],
  },

  // ── Moonshot Kimi (coding) ────────────────────────────────────────────────
  "kimi-coding": {
    baseUrl: "https://api.kimi.com/coding/",
    api: "anthropic-messages",
    models: [
      { id: "kimi-coding", name: "Kimi for Coding", reasoning: false, input: ["text"], cost: FREE_COST, contextWindow: 200000, maxTokens: 8192 },
    ],
  },
};

// ─── Env-var key map ─────────────────────────────────────────────────────────
//
// Maps provider group id → environment variable name for API key storage.
// Used when writing the env section of openclaw.json.

export const PROVIDER_ENV_KEY_MAP: Record<string, string> = {
  anthropic:    "ANTHROPIC_API_KEY",
  openai:       "OPENAI_API_KEY",
  google:       "GOOGLE_API_KEY",
  gemini:       "GOOGLE_API_KEY",
  mistral:      "MISTRAL_API_KEY",
  groq:         "GROQ_API_KEY",
  cohere:       "COHERE_API_KEY",
  minimax:      "MINIMAX_API_KEY",
  "minimax-cn": "MINIMAX_API_KEY",
  xai:          "XAI_API_KEY",
  deepseek:     "DEEPSEEK_API_KEY",
  together:     "TOGETHER_API_KEY",
  fireworks:    "FIREWORKS_API_KEY",
  perplexity:   "PERPLEXITY_API_KEY",
  moonshot:     "MOONSHOT_API_KEY",
  "moonshot-cn":"MOONSHOT_API_KEY",
  "kimi-coding": "KIMI_API_KEY",
  zhipu:        "ZHIPU_API_KEY",
  qwen:         "QWEN_API_KEY",
  baidu:        "QIANFAN_API_KEY",
  qianfan:      "QIANFAN_API_KEY",
  yi:           "YI_API_KEY",
  openrouter:   "OPENROUTER_API_KEY",
  kilocode:     "KILOCODE_API_KEY",
  litellm:      "LITELLM_API_KEY",
  venice:       "VENICE_API_KEY",
  huggingface:  "HF_TOKEN",
};
