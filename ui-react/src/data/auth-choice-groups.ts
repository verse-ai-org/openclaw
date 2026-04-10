/**
 * auth-choice-groups.ts
 *
 * Static copy of the CLI provider/auth-method definitions.
 * Source of truth: src/commands/auth-choice-options.ts (AUTH_CHOICE_GROUP_DEFS)
 * and src/commands/onboard-provider-auth-flags.ts (ONBOARD_PROVIDER_AUTH_FLAGS).
 *
 * Keep this file in sync with those CLI files when providers are added/removed.
 * Do NOT import directly from src/ — this package must not depend on CLI internals.
 */

export type AuthMethodType = "api-key" | "oauth" | "custom" | "proxy";

export interface AuthMethodDef {
  /** Matches CLI AuthChoice, e.g. "openai-api-key" | "openai-codex" */
  id: string;
  label: string;
  hint?: string;
  type: AuthMethodType;
  /** Environment variable name for this key, e.g. "OPENAI_API_KEY" */
  envVar?: string;
  /** URL to the provider console / API key page */
  consoleUrl?: string;
  /** Placeholder text shown in the API key input */
  keyPlaceholder?: string;
  /** Default model id set when this auth method is chosen */
  defaultModelId?: string;
}

export interface AuthProviderGroupDef {
  /** Matches CLI AuthChoiceGroupId, e.g. "openai" | "anthropic" */
  id: string;
  label: string;
  hint?: string;
  /** Whether to show this provider as a featured card on the first screen */
  featured?: boolean;
  methods: AuthMethodDef[];
}

export const AUTH_PROVIDER_GROUPS: AuthProviderGroupDef[] = [
  // ── Featured providers (shown as cards on first screen) ──────────────────
  {
    id: "anthropic",
    label: "Anthropic",
    hint: "Claude — setup-token + API key",
    featured: true,
    methods: [
      {
        id: "token",
        label: "Anthropic setup-token",
        hint: "Run `claude setup-token` elsewhere, then paste the token here",
        type: "oauth",
        defaultModelId: "anthropic/claude-opus-4-6",
      },
      {
        id: "apiKey",
        label: "Anthropic API key",
        type: "api-key",
        envVar: "ANTHROPIC_API_KEY",
        consoleUrl: "https://console.anthropic.com/account/keys",
        keyPlaceholder: "sk-ant-...",
        defaultModelId: "anthropic/claude-opus-4-6",
      },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    hint: "Codex OAuth + API key",
    featured: true,
    methods: [
      {
        id: "openai-codex",
        label: "OpenAI Codex (ChatGPT OAuth)",
        type: "oauth",
        defaultModelId: "openai/codex-mini-latest",
      },
      {
        id: "openai-api-key",
        label: "OpenAI API key",
        type: "api-key",
        envVar: "OPENAI_API_KEY",
        consoleUrl: "https://platform.openai.com/account/api-keys",
        keyPlaceholder: "sk-...",
        defaultModelId: "openai/gpt-5.1-codex",
      },
    ],
  },
  {
    id: "google",
    label: "Google",
    hint: "Gemini API key + OAuth",
    featured: true,
    methods: [
      {
        id: "gemini-api-key",
        label: "Google Gemini API key",
        type: "api-key",
        envVar: "GEMINI_API_KEY",
        consoleUrl: "https://aistudio.google.com/app/apikey",
        keyPlaceholder: "AIza...",
        defaultModelId: "google/gemini-2.5-pro",
      },
      {
        id: "google-gemini-cli",
        label: "Google Gemini CLI OAuth",
        hint: "Unofficial flow; review account-risk warning before use",
        type: "oauth",
        defaultModelId: "google/gemini-2.5-pro",
      },
    ],
  },
  {
    id: "minimax",
    label: "MiniMax",
    hint: "M2.5 Global (recommended)",
    methods: [
      {
        id: "minimax-portal",
        label: "MiniMax OAuth (Global)",
        hint: "OAuth plugin for MiniMax — international users",
        type: "oauth",
        defaultModelId: "minimax/MiniMax-M2.7",
      },
      {
        id: "minimax-api",
        label: "MiniMax M2.7 API key",
        type: "api-key",
        envVar: "MINIMAX_API_KEY",
        consoleUrl: "https://platform.minimaxi.com",
        keyPlaceholder: "...",
        defaultModelId: "minimax/MiniMax-M2.7",
      },
      {
        id: "minimax-api-lightning",
        label: "MiniMax M2.7 Highspeed",
        hint: "Official fast tier",
        type: "api-key",
        envVar: "MINIMAX_API_KEY",
        consoleUrl: "https://platform.minimaxi.com",
        keyPlaceholder: "...",
        defaultModelId: "minimax/MiniMax-M2.7-Lightning",
      },
    ],
  },
  {
    id: "minimax-cn",
    label: "MiniMax (CN)",
    hint: "China endpoint (api.minimaxi.com)",
    methods: [
      {
        id: "minimax-portal-cn",
        label: "MiniMax OAuth (CN)",
        hint: "OAuth plugin for MiniMax — users in China",
        type: "oauth",
        defaultModelId: "minimax-cn/MiniMax-M2.7",
      },
      {
        id: "minimax-api-key-cn",
        label: "MiniMax M2.7 China API key",
        hint: "China endpoint (api.minimaxi.com)",
        type: "api-key",
        envVar: "MINIMAX_API_KEY",
        consoleUrl: "https://api.minimaxi.com",
        keyPlaceholder: "...",
        defaultModelId: "minimax-cn/MiniMax-M2.7",
      },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    hint: "API key — 100+ models",
    methods: [
      {
        id: "openrouter-api-key",
        label: "OpenRouter API key",
        type: "api-key",
        envVar: "OPENROUTER_API_KEY",
        consoleUrl: "https://openrouter.ai/keys",
        keyPlaceholder: "sk-or-...",
        defaultModelId: "openrouter/auto",
      },
    ],
  },
  {
    id: "zai",
    label: "Z.AI",
    hint: "GLM Coding Plan / Global / CN",
    methods: [
      {
        id: "zai-coding-global",
        label: "Coding-Plan-Global",
        hint: "GLM Coding Plan Global (api.z.ai)",
        type: "api-key",
        envVar: "ZAI_API_KEY",
        consoleUrl: "https://api.z.ai",
        keyPlaceholder: "...",
        defaultModelId: "zai/glm-5",
      },
      {
        id: "zai-coding-cn",
        label: "Coding-Plan-CN",
        hint: "GLM Coding Plan CN (open.bigmodel.cn)",
        type: "api-key",
        envVar: "ZAI_API_KEY",
        consoleUrl: "https://open.bigmodel.cn",
        keyPlaceholder: "...",
        defaultModelId: "zai/glm-5",
      },
      {
        id: "zai-global",
        label: "Z.AI Global",
        hint: "api.z.ai",
        type: "api-key",
        envVar: "ZAI_API_KEY",
        consoleUrl: "https://api.z.ai",
        keyPlaceholder: "...",
        defaultModelId: "zai/glm-5",
      },
      {
        id: "zai-cn",
        label: "Z.AI CN",
        hint: "open.bigmodel.cn",
        type: "api-key",
        envVar: "ZAI_API_KEY",
        consoleUrl: "https://open.bigmodel.cn",
        keyPlaceholder: "...",
        defaultModelId: "zai/glm-5",
      },
    ],
  },

  // ── Additional providers ──────────────────────────────────────────────────
  {
    id: "moonshot",
    label: "Moonshot AI (Kimi)",
    hint: "Kimi K2.5 + Kimi Coding",
    methods: [
      {
        id: "moonshot-api-key",
        label: "Kimi API key (.ai)",
        type: "api-key",
        envVar: "MOONSHOT_API_KEY",
        consoleUrl: "https://platform.moonshot.ai/console/api-keys",
        keyPlaceholder: "sk-...",
        defaultModelId: "moonshot/kimi-k2.5",
      },
      {
        id: "moonshot-api-key-cn",
        label: "Kimi API key (.cn)",
        type: "api-key",
        envVar: "MOONSHOT_API_KEY",
        consoleUrl: "https://platform.moonshot.cn/console/api-keys",
        keyPlaceholder: "sk-...",
        defaultModelId: "moonshot/kimi-k2.5",
      },
      {
        id: "kimi-code-api-key",
        label: "Kimi Code API key (subscription)",
        type: "api-key",
        envVar: "KIMI_CODE_API_KEY",
        consoleUrl: "https://kimi.moonshot.cn",
        keyPlaceholder: "sk-...",
        defaultModelId: "kimi-coding/k2p5",
      },
    ],
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    hint: "API key",
    methods: [
      {
        id: "xai-api-key",
        label: "xAI API key",
        type: "api-key",
        envVar: "XAI_API_KEY",
        consoleUrl: "https://console.x.ai",
        keyPlaceholder: "xai-...",
        defaultModelId: "xai/grok-4",
      },
    ],
  },
  {
    id: "mistral",
    label: "Mistral AI",
    hint: "API key",
    methods: [
      {
        id: "mistral-api-key",
        label: "Mistral API key",
        type: "api-key",
        envVar: "MISTRAL_API_KEY",
        consoleUrl: "https://console.mistral.ai/api-keys",
        keyPlaceholder: "...",
        defaultModelId: "mistral/mistral-large-latest",
      },
    ],
  },
  {
    id: "volcengine",
    label: "Volcano Engine",
    hint: "API key",
    methods: [
      {
        id: "volcengine-api-key",
        label: "Volcano Engine API key",
        type: "api-key",
        envVar: "VOLCENGINE_API_KEY",
        consoleUrl: "https://console.volcengine.com",
        keyPlaceholder: "...",
        defaultModelId: "volcengine/doubao-pro-32k",
      },
    ],
  },
  {
    id: "byteplus",
    label: "BytePlus",
    hint: "API key",
    methods: [
      {
        id: "byteplus-api-key",
        label: "BytePlus API key",
        type: "api-key",
        envVar: "BYTEPLUS_API_KEY",
        consoleUrl: "https://console.byteplus.com",
        keyPlaceholder: "...",
        defaultModelId: "byteplus/doubao-pro-32k",
      },
    ],
  },
  {
    id: "kilocode",
    label: "Kilo Gateway",
    hint: "API key (OpenRouter-compatible)",
    methods: [
      {
        id: "kilocode-api-key",
        label: "Kilo Gateway API key",
        type: "api-key",
        envVar: "KILOCODE_API_KEY",
        consoleUrl: "https://kilocode.ai",
        keyPlaceholder: "...",
        defaultModelId: "kilocode/anthropic/claude-opus-4-6",
      },
    ],
  },
  {
    id: "qwen",
    label: "Qwen",
    hint: "OAuth",
    methods: [
      {
        id: "qwen-portal",
        label: "Qwen OAuth",
        type: "oauth",
        defaultModelId: "qwen/qwen-plus",
      },
    ],
  },
  {
    id: "qianfan",
    label: "Qianfan",
    hint: "API key",
    methods: [
      {
        id: "qianfan-api-key",
        label: "Qianfan API key",
        type: "api-key",
        envVar: "QIANFAN_API_KEY",
        consoleUrl: "https://console.bce.baidu.com",
        keyPlaceholder: "...",
        defaultModelId: "qianfan/ernie-4.0-8k",
      },
    ],
  },
  {
    id: "modelstudio",
    label: "Alibaba Cloud Model Studio",
    hint: "Coding Plan API key (CN / Global)",
    methods: [
      {
        id: "modelstudio-api-key-cn",
        label: "Coding Plan API Key (China)",
        hint: "coding.dashscope.aliyuncs.com",
        type: "api-key",
        envVar: "MODELSTUDIO_API_KEY",
        consoleUrl: "https://bailian.console.aliyun.com",
        keyPlaceholder: "...",
        defaultModelId: "modelstudio/qwen3.5-plus",
      },
      {
        id: "modelstudio-api-key",
        label: "Coding Plan API Key (Global/Intl)",
        hint: "coding-intl.dashscope.aliyuncs.com",
        type: "api-key",
        envVar: "MODELSTUDIO_API_KEY",
        consoleUrl: "https://bailian.console.aliyun.com",
        keyPlaceholder: "...",
        defaultModelId: "modelstudio/qwen3.5-plus",
      },
    ],
  },
  {
    id: "copilot",
    label: "Copilot",
    hint: "GitHub + local proxy",
    methods: [
      {
        id: "github-copilot",
        label: "GitHub Copilot (GitHub device login)",
        hint: "Uses GitHub device flow",
        type: "oauth",
        defaultModelId: "copilot/gpt-4o",
      },
      {
        id: "copilot-proxy",
        label: "Copilot Proxy (local)",
        hint: "Local proxy for VS Code Copilot models",
        type: "proxy",
        defaultModelId: "copilot/gpt-4o",
      },
    ],
  },
  {
    id: "chutes",
    label: "Chutes",
    hint: "OAuth",
    methods: [
      {
        id: "chutes",
        label: "Chutes (OAuth)",
        type: "oauth",
        defaultModelId: "chutes/deepseek-ai/DeepSeek-V3-0324",
      },
    ],
  },
  {
    id: "vllm",
    label: "vLLM",
    hint: "Local/self-hosted OpenAI-compatible",
    methods: [
      {
        id: "vllm",
        label: "vLLM (custom URL + model)",
        hint: "Local/self-hosted OpenAI-compatible server",
        type: "custom",
        defaultModelId: "",
      },
    ],
  },
  {
    id: "ai-gateway",
    label: "Vercel AI Gateway",
    hint: "API key",
    methods: [
      {
        id: "ai-gateway-api-key",
        label: "Vercel AI Gateway API key",
        type: "api-key",
        envVar: "AI_GATEWAY_API_KEY",
        consoleUrl: "https://vercel.com/dashboard",
        keyPlaceholder: "...",
        defaultModelId: "vercel-ai-gateway/anthropic/claude-opus-4.6",
      },
    ],
  },
  {
    id: "cloudflare-ai-gateway",
    label: "Cloudflare AI Gateway",
    hint: "Account ID + Gateway ID + API key",
    methods: [
      {
        id: "cloudflare-ai-gateway-api-key",
        label: "Cloudflare AI Gateway",
        hint: "Account ID + Gateway ID + API key",
        type: "api-key",
        envVar: "CLOUDFLARE_AI_GATEWAY_API_KEY",
        consoleUrl: "https://dash.cloudflare.com",
        keyPlaceholder: "...",
        defaultModelId: "cloudflare-ai-gateway/claude-sonnet-4-5",
      },
    ],
  },
  {
    id: "opencode",
    label: "OpenCode",
    hint: "Shared API key for Zen + Go catalogs",
    methods: [
      {
        id: "opencode-zen",
        label: "OpenCode Zen catalog",
        hint: "Claude, GPT, Gemini via opencode.ai/zen",
        type: "api-key",
        envVar: "OPENCODE_ZEN_API_KEY",
        consoleUrl: "https://opencode.ai/zen",
        keyPlaceholder: "...",
        defaultModelId: "opencode/claude-opus-4-6",
      },
      {
        id: "opencode-go",
        label: "OpenCode Go catalog",
        hint: "Kimi/GLM/MiniMax Go catalog",
        type: "api-key",
        envVar: "OPENCODE_GO_API_KEY",
        consoleUrl: "https://opencode.ai",
        keyPlaceholder: "...",
        defaultModelId: "opencode-go/kimi-k2.5",
      },
    ],
  },
  {
    id: "xiaomi",
    label: "Xiaomi",
    hint: "API key",
    methods: [
      {
        id: "xiaomi-api-key",
        label: "Xiaomi API key",
        type: "api-key",
        envVar: "XIAOMI_API_KEY",
        consoleUrl: "https://ai.xiaomi.com",
        keyPlaceholder: "...",
        defaultModelId: "xiaomi/mimo-v2-flash",
      },
    ],
  },
  {
    id: "synthetic",
    label: "Synthetic",
    hint: "Anthropic-compatible (multi-model)",
    methods: [
      {
        id: "synthetic-api-key",
        label: "Synthetic API key",
        type: "api-key",
        envVar: "SYNTHETIC_API_KEY",
        consoleUrl: "https://syntheticai.com",
        keyPlaceholder: "...",
        defaultModelId: "synthetic/hf:MiniMaxAI/MiniMax-M2.7",
      },
    ],
  },
  {
    id: "together",
    label: "Together AI",
    hint: "API key",
    methods: [
      {
        id: "together-api-key",
        label: "Together AI API key",
        type: "api-key",
        envVar: "TOGETHER_API_KEY",
        consoleUrl: "https://api.together.ai",
        keyPlaceholder: "...",
        defaultModelId: "together/moonshotai/Kimi-K2.5",
      },
    ],
  },
  {
    id: "huggingface",
    label: "Hugging Face",
    hint: "Inference API (HF token)",
    methods: [
      {
        id: "huggingface-api-key",
        label: "Hugging Face token",
        hint: "Inference Providers — OpenAI-compatible chat",
        type: "api-key",
        envVar: "HUGGINGFACE_API_KEY",
        consoleUrl: "https://huggingface.co/settings/tokens",
        keyPlaceholder: "hf_...",
        defaultModelId: "huggingface/deepseek-ai/DeepSeek-R1",
      },
    ],
  },
  {
    id: "venice",
    label: "Venice AI",
    hint: "Privacy-focused (uncensored models)",
    methods: [
      {
        id: "venice-api-key",
        label: "Venice AI API key",
        hint: "Privacy-focused inference",
        type: "api-key",
        envVar: "VENICE_API_KEY",
        consoleUrl: "https://venice.ai",
        keyPlaceholder: "...",
        defaultModelId: "venice/llama-3.3-70b",
      },
    ],
  },
  {
    id: "litellm",
    label: "LiteLLM",
    hint: "Unified LLM gateway (100+ providers)",
    methods: [
      {
        id: "litellm-api-key",
        label: "LiteLLM API key",
        hint: "Unified gateway for 100+ LLM providers",
        type: "api-key",
        envVar: "LITELLM_API_KEY",
        consoleUrl: "https://litellm.ai",
        keyPlaceholder: "sk-...",
        defaultModelId: "litellm/claude-opus-4-6",
      },
    ],
  },
  {
    id: "custom",
    label: "Custom Provider",
    hint: "Any OpenAI or Anthropic compatible endpoint",
    methods: [
      {
        id: "custom-api-key",
        label: "Custom Provider",
        hint: "Enter base URL, API key, and model ID",
        type: "custom",
        defaultModelId: "",
      },
    ],
  },
];

/** Look up a provider group by its id. */
export function findProviderGroup(
  id: string,
): AuthProviderGroupDef | undefined {
  return AUTH_PROVIDER_GROUPS.find((g) => g.id === id);
}

/** Look up an auth method across all groups by its id. */
export function findAuthMethod(methodId: string): AuthMethodDef | undefined {
  for (const group of AUTH_PROVIDER_GROUPS) {
    const method = group.methods.find((m) => m.id === methodId);
    if (method) return method;
  }
  return undefined;
}

/** Return only the featured provider groups. */
export function getFeaturedProviders(): AuthProviderGroupDef[] {
  return AUTH_PROVIDER_GROUPS.filter((g) => g.featured);
}

/**
 * Given an authMethod id, return the parent provider group.
 * e.g. "openai-api-key" → the "openai" group.
 */
export function findProviderGroupForMethod(
  methodId: string,
): AuthProviderGroupDef | undefined {
  return AUTH_PROVIDER_GROUPS.find((g) =>
    g.methods.some((m) => m.id === methodId),
  );
}
