/** Provider icon emoji map — purely cosmetic */
export const PROVIDER_EMOJI: Record<string, string> = {
  anthropic: "🟠",
  openai: "🟢",
  google: "🔵",
  moonshot: "🌙",
  xai: "✖️",
  mistral: "🌊",
  minimax: "⚡",
  "minimax-cn": "⚡",
  volcengine: "🌋",
  byteplus: "🔶",
  openrouter: "🔀",
  kilocode: "⚙️",
  qwen: "☁️",
  zai: "🤖",
  qianfan: "🦅",
  modelstudio: "☁️",
  copilot: "🐙",
  chutes: "🧵",
  vllm: "🏠",
  "ai-gateway": "△",
  "cloudflare-ai-gateway": "🟠",
  opencode: "</>",
  xiaomi: "📱",
  synthetic: "🧪",
  together: "🤝",
  huggingface: "🤗",
  venice: "🏛️",
  litellm: "🔗",
  custom: "🔧",
};

/** Per-provider select button labels matching design copy */
export const FEATURED_SELECT_LABEL: Record<string, string> = {
  anthropic: "Select Claude 3.5",
  openai: "Select GPT-4o",
  google: "Select Gemini 1.5",
};

/** Per-provider button gradients from Figma design spec */
export const FEATURED_BTN_GRADIENT: Record<string, string> = {
  // Anthropic: orange-brown
  anthropic: "linear-gradient(180deg, #D97757 0%, #C25E3F 100%)",
  // OpenAI: teal-green
  openai: "linear-gradient(180deg, #10A37F 0%, #0D8A6B 100%)",
  // Google: blue
  google: "linear-gradient(180deg, #4285F4 0%, #3367D6 100%)",
};
