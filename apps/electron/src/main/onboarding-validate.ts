/**
 * onboarding-validate.ts
 *
 * Lightweight API key validation for the onboarding wizard.
 * Performs a minimal probe request against the provider's API to verify
 * the key is valid without consuming significant resources.
 */

import { PROVIDER_REGISTRY } from "./onboarding-providers.js";

// ─── authMethod → provider id map ────────────────────────────────────────────
// Maps UI auth method ids (from auth-choice-groups.ts) to provider registry keys.
// When adding a new auth method, add an entry here + a probe in PROVIDER_PROBE_MAP.

const AUTH_METHOD_TO_PROVIDER: Record<string, string> = {
  // Anthropic
  token:                    "anthropic",
  apiKey:                   "anthropic",
  // OpenAI
  "openai-api-key":         "openai",
  "openai-codex":           "openai",
  // Google
  "gemini-api-key":         "google",
  "google-gemini-cli":      "google",
  // MiniMax
  "minimax-api":            "minimax",
  "minimax-cloud":          "minimax",
  "minimax-api-lightning":  "minimax",
  "minimax-api-key-cn":     "minimax-cn",
  // Mistral
  "mistral-api-key":        "mistral",
  // xAI
  "xai-api-key":            "xai",
  // Moonshot
  "moonshot-api-key":       "moonshot",
  "moonshot-api-key-cn":    "moonshot-cn",
  "kimi-code-api-key":      "kimi-coding",
  // OpenRouter
  "openrouter-api-key":     "openrouter",
  // DeepSeek
  "deepseek-api-key":       "deepseek",
  // Groq
  "groq-api-key":           "groq",
  // Together
  "together-api-key":       "together",
  // Perplexity
  "perplexity-api-key":     "perplexity",
  // Zhipu
  "zhipu-api-key":          "zhipu",
  // Hugging Face
  "huggingface-api-key":    "huggingface",
  // Z.AI (GLM)
  "zai-coding-global":      "zai",
  "zai-global":             "zai",
  "zai-coding-cn":          "zai-cn",
  "zai-cn":                 "zai-cn",
  // Alibaba Cloud Model Studio
  "modelstudio-api-key":    "modelstudio",
  "modelstudio-api-key-cn": "modelstudio-cn",
  // Volcano Engine
  "volcengine-api-key":     "volcengine",
  // BytePlus
  "byteplus-api-key":       "byteplus",
  // Kilo Gateway
  "kilocode-api-key":       "kilocode",
  // OpenCode
  "opencode-zen":           "opencode",
  "opencode-go":            "opencode-go",
  // Xiaomi
  "xiaomi-api-key":         "xiaomi",
  // Venice AI
  "venice-api-key":         "venice",
  // LiteLLM
  "litellm-api-key":        "litellm",
};

// ─── Provider-specific probe configs ─────────────────────────────────────────
// Describes the minimal HTTP request to verify a key is accepted.

type ProbeConfig = {
  url: string;
  method: "GET" | "POST";
  headers: (apiKey: string) => Record<string, string>;
  body?: () => string;
  /** HTTP status codes that indicate the key is valid */
  validStatuses?: number[];
  /** HTTP status codes that definitively mean invalid key */
  invalidStatuses?: number[];
};

function makeAnthropicProbe(baseUrl: string): ProbeConfig {
  // baseUrl is the full Anthropic-compatible base (e.g. https://api.minimax.io/anthropic).
  // Use POST /v1/messages with a minimal body — many Anthropic-compatible providers
  // do not expose GET /v1/models, but always expose /v1/messages.
  // A real invalid key returns 401/403; an empty/missing model returns 400 (key accepted).
  const normalizedBase = baseUrl.replace(/\/$/, "");
  return {
    url: `${normalizedBase}/v1/messages`,
    method: "POST",
    headers: (key) => ({
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    }),
    body: () => JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
    // 200 = valid key + valid model, 400 = valid key but bad request (model mismatch etc.)
    // Both indicate the key was accepted by the auth layer.
    validStatuses: [200, 400, 529],
    invalidStatuses: [401, 403],
  };
}

function makeOpenAIProbe(baseUrl: string): ProbeConfig {
  return {
    url: `${baseUrl}/models`,
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    validStatuses: [200],
    invalidStatuses: [401, 403],
  };
}

const PROVIDER_PROBE_MAP: Record<string, ProbeConfig> = {
  // ── First-party providers (endpoints not in PROVIDER_REGISTRY) ───────────
  anthropic: {
    url: "https://api.anthropic.com/v1/models",
    method: "GET",
    headers: (key) => ({
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    }),
    validStatuses: [200],
    invalidStatuses: [401, 403],
  },
  openai: makeOpenAIProbe("https://api.openai.com/v1"),
  google: {
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    method: "GET",
    headers: (key) => ({ "X-goog-api-key": key }),
    validStatuses: [200],
    invalidStatuses: [400, 401, 403],
  },
  huggingface: {
    url: "https://huggingface.co/api/whoami-v2",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    validStatuses: [200],
    invalidStatuses: [401, 403],
  },

  // ── Providers from PROVIDER_REGISTRY (baseUrl read directly) ─────────────
  minimax:       makeAnthropicProbe(PROVIDER_REGISTRY.minimax?.baseUrl ?? "https://api.minimax.io/anthropic"),
  "minimax-cn":  makeAnthropicProbe(PROVIDER_REGISTRY["minimax-cn"]?.baseUrl ?? "https://api.minimaxi.com/anthropic"),
  mistral:       makeOpenAIProbe(PROVIDER_REGISTRY.mistral?.baseUrl ?? "https://api.mistral.ai/v1"),
  xai:           makeOpenAIProbe(PROVIDER_REGISTRY.xai?.baseUrl ?? "https://api.x.ai/v1"),
  moonshot:      makeOpenAIProbe(PROVIDER_REGISTRY.moonshot?.baseUrl ?? "https://api.moonshot.ai/v1"),
  "moonshot-cn": makeOpenAIProbe(PROVIDER_REGISTRY["moonshot-cn"]?.baseUrl ?? "https://api.moonshot.cn/v1"),
  "kimi-coding": makeAnthropicProbe(PROVIDER_REGISTRY["kimi-coding"]?.baseUrl ?? "https://api.kimi.com/coding/"),
  openrouter:    makeOpenAIProbe(PROVIDER_REGISTRY.openrouter?.baseUrl ?? "https://openrouter.ai/api/v1"),
  deepseek:      makeOpenAIProbe(PROVIDER_REGISTRY.deepseek?.baseUrl ?? "https://api.deepseek.com/v1"),
  groq:          makeOpenAIProbe(PROVIDER_REGISTRY.groq?.baseUrl ?? "https://api.groq.com/openai/v1"),
  together:      makeOpenAIProbe(PROVIDER_REGISTRY.together?.baseUrl ?? "https://api.together.xyz/v1"),
  perplexity:    makeOpenAIProbe(PROVIDER_REGISTRY.perplexity?.baseUrl ?? "https://api.perplexity.ai"),
  zhipu:         makeOpenAIProbe(PROVIDER_REGISTRY.zhipu?.baseUrl ?? "https://open.bigmodel.cn/api/paas/v4"),

  // ── Z.AI (GLM) — Global and CN endpoints differ ───────────────────────────
  zai:       makeOpenAIProbe("https://api.z.ai/v1"),
  "zai-cn":  makeOpenAIProbe("https://open.bigmodel.cn/api/paas/v4"),

  // ── Alibaba Cloud Model Studio — Global (intl) and CN endpoints differ ───
  modelstudio:      makeOpenAIProbe("https://coding-intl.dashscope.aliyuncs.com/compatible-mode/v1"),
  "modelstudio-cn": makeOpenAIProbe("https://coding.dashscope.aliyuncs.com/compatible-mode/v1"),

  // ── Volcano Engine ────────────────────────────────────────────────────────
  volcengine: makeOpenAIProbe("https://ark.cn-beijing.volces.com/api/v3"),

  // ── BytePlus ──────────────────────────────────────────────────────────────
  byteplus: makeOpenAIProbe("https://api.byteplus.com/v1"),

  // ── Kilo Gateway (OpenRouter-compatible) ──────────────────────────────────
  kilocode: makeOpenAIProbe("https://kilocode.ai/api/v1"),

  // ── OpenCode ──────────────────────────────────────────────────────────────
  opencode:      makeOpenAIProbe("https://opencode.ai/v1"),
  "opencode-go": makeOpenAIProbe("https://opencode.ai/go/v1"),

  // ── Xiaomi ────────────────────────────────────────────────────────────────
  xiaomi: makeOpenAIProbe("https://ai.xiaomi.com/v1"),

  // ── Venice AI ─────────────────────────────────────────────────────────────
  venice: makeOpenAIProbe("https://api.venice.ai/api/v1"),

  // ── LiteLLM (default cloud endpoint; self-hosted users bypass validation) ─
  litellm: makeOpenAIProbe("https://api.litellm.ai/v1"),
};

// ─── Main validation function ────────────────────────────────────────────────

export async function validateApiKey(
  authMethod: string,
  apiKey: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return { ok: false, error: "API key cannot be empty." };
  }

  const provider = AUTH_METHOD_TO_PROVIDER[authMethod];
  if (!provider) {
    console.warn(`[onboarding-validate] Unknown authMethod "${authMethod}", skipping probe — accepting non-empty key`);
    return { ok: true };
  }

  const probe = PROVIDER_PROBE_MAP[provider];
  if (!probe) {
    console.warn(`[onboarding-validate] No probe config for provider "${provider}" (authMethod="${authMethod}"), skipping probe — accepting non-empty key`);
    return { ok: true };
  }

  console.log(`[onboarding-validate] probe start  authMethod=${authMethod} provider=${provider} url=${probe.url} method=${probe.method}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const t0 = Date.now();

    const response = await fetch(probe.url, {
      method: probe.method,
      headers: {
        ...probe.headers(trimmed),
        "User-Agent": "openclaw-electron/onboarding",
      },
      body: probe.body ? probe.body() : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const elapsed = Date.now() - t0;

    const { status } = response;
    const invalidStatuses = probe.invalidStatuses ?? [401, 403];
    const validStatuses = probe.validStatuses ?? [200, 201];

    console.log(`[onboarding-validate] probe result authMethod=${authMethod} provider=${provider} url=${probe.url} status=${status} elapsed=${elapsed}ms validStatuses=${JSON.stringify(validStatuses)} invalidStatuses=${JSON.stringify(invalidStatuses)}`);

    if (invalidStatuses.includes(status)) {
      console.log(`[onboarding-validate] INVALID KEY  authMethod=${authMethod} provider=${provider} status=${status}`);
      return { ok: false, error: `Invalid API key (HTTP ${status}).` };
    }
    if (validStatuses.includes(status)) {
      console.log(`[onboarding-validate] VALID KEY    authMethod=${authMethod} provider=${provider} status=${status}`);
      return { ok: true };
    }
    // Unexpected status — treat as valid to avoid false negatives
    console.warn(`[onboarding-validate] UNEXPECTED   authMethod=${authMethod} provider=${provider} url=${probe.url} status=${status} (not in validStatuses or invalidStatuses) — treating as valid`);
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.warn(`[onboarding-validate] TIMEOUT      authMethod=${authMethod} provider=${provider} url=${probe.url} (10s)`);
      return { ok: false, error: "Connection timed out. Check your network." };
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[onboarding-validate] NETWORK ERR  authMethod=${authMethod} provider=${provider} url=${probe.url} error=${msg}`);
    return { ok: false, error: `Network error: ${msg}` };
  }
}
