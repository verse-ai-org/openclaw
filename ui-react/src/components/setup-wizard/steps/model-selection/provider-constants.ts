import anthropicImg from "@/assets/anthropic.png";
import chatgptImg from "@/assets/chatgpt.png";
import googleImg from "@/assets/google.webp";
import minimaxImg from "@/assets/minimax.png";

/** Provider logo images — used in place of emoji when available */
export const PROVIDER_IMAGE: Record<string, string> = {
  anthropic: anthropicImg,
  openai: chatgptImg,
  google: googleImg,
  minimax: minimaxImg,
};

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
  anthropic: "Select Claude",
  openai: "Select ChatGPT",
  google: "Select Gemini",
};

/** Per-provider button gradients from Figma design spec */
export const FEATURED_BTN_GRADIENT: Record<string, string> = {
  // Anthropic: orange-brown
  anthropic: "linear-gradient(180deg, #D97757 0%, #C25E3F 100%)",
  // OpenAI: teal-green
  openai: "linear-gradient(180deg, #10A37F 0%, #0D8A6B 100%)",
  // Google: blue
  google: "linear-gradient(180deg, #4285F4 0%, #3367D6 100%)",
  // Minimax: red
  minimax: "linear-gradient(180deg, #FF5722 0%, #E0311D 100%)",
};
