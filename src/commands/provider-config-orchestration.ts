import type { OpenClawConfig } from "../config/config.js";
import { buildMinimaxPortalProvider } from "../agents/models-config.providers.static.js";
import {
  applyCloudflareAiGatewayConfig,
  applyCloudflareAiGatewayProviderConfig,
  applyDeepseekConfig,
  applyDeepseekProviderConfig,
  applyHuggingfaceConfig,
  applyHuggingfaceProviderConfig,
  applyKilocodeConfig,
  applyKilocodeProviderConfig,
  applyKimiCodeConfig,
  applyKimiCodeProviderConfig,
  applyLitellmConfig,
  applyLitellmProviderConfig,
  applyMinimaxApiConfig,
  applyMinimaxApiConfigCn,
  applyMinimaxApiProviderConfig,
  applyMinimaxApiProviderConfigCn,
  applyMistralConfig,
  applyMistralProviderConfig,
  applyModelStudioConfig,
  applyModelStudioConfigCn,
  applyModelStudioProviderConfig,
  applyModelStudioProviderConfigCn,
  applyMoonshotConfig,
  applyMoonshotConfigCn,
  applyMoonshotProviderConfig,
  applyMoonshotProviderConfigCn,
  applyOpencodeGoConfig,
  applyOpencodeGoProviderConfig,
  applyOpencodeZenConfig,
  applyOpencodeZenProviderConfig,
  applyOpenrouterConfig,
  applyOpenrouterProviderConfig,
  applyQianfanConfig,
  applyQianfanProviderConfig,
  applySyntheticConfig,
  applySyntheticProviderConfig,
  applyTogetherConfig,
  applyTogetherProviderConfig,
  applyVeniceConfig,
  applyVeniceProviderConfig,
  applyVercelAiGatewayConfig,
  applyVercelAiGatewayProviderConfig,
  applyXaiConfig,
  applyXaiProviderConfig,
  applyXiaomiConfig,
  applyXiaomiProviderConfig,
  applyZaiConfig,
  applyZaiProviderConfig,
} from "./onboard-auth.js";

type ConfigApplier = (cfg: OpenClawConfig) => OpenClawConfig;

function applyAgentDefaultPrimary(cfg: OpenClawConfig, modelRef: string): OpenClawConfig {
  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        model: { primary: modelRef },
      },
    },
  };
}

function applyMinimaxPortalProviderConfig(cfg: OpenClawConfig): OpenClawConfig {
  const providers = { ...(cfg.models?.providers ?? {}) };
  const existingProvider = providers["minimax-portal"];
  const defaultProvider = buildMinimaxPortalProvider();
  const existingModels = Array.isArray(existingProvider?.models) ? existingProvider.models : [];
  const mergedModels = [
    ...existingModels,
    ...defaultProvider.models.filter((model) => !existingModels.some((m) => m.id === model.id)),
  ];
  providers["minimax-portal"] = {
    ...defaultProvider,
    ...existingProvider,
    models: mergedModels.length > 0 ? mergedModels : defaultProvider.models,
  };
  return {
    ...cfg,
    models: {
      ...(cfg.models ?? {}),
      mode: cfg.models?.mode ?? "merge",
      providers,
    },
  };
}

const PROVIDER_APPLIERS: Record<
  string,
  { provider: ConfigApplier; defaultModel: ConfigApplier }
> = {
  "ai-gateway": {
    provider: applyVercelAiGatewayProviderConfig,
    defaultModel: applyVercelAiGatewayConfig,
  },
  "cloudflare-ai-gateway": {
    provider: applyCloudflareAiGatewayProviderConfig,
    defaultModel: applyCloudflareAiGatewayConfig,
  },
  deepseek: {
    provider: applyDeepseekProviderConfig,
    defaultModel: applyDeepseekConfig,
  },
  huggingface: {
    provider: applyHuggingfaceProviderConfig,
    defaultModel: applyHuggingfaceConfig,
  },
  kilocode: {
    provider: applyKilocodeProviderConfig,
    defaultModel: applyKilocodeConfig,
  },
  "kimi-coding": {
    provider: applyKimiCodeProviderConfig,
    defaultModel: applyKimiCodeConfig,
  },
  litellm: {
    provider: applyLitellmProviderConfig,
    defaultModel: applyLitellmConfig,
  },
  minimax: {
    provider: applyMinimaxApiProviderConfig,
    defaultModel: (cfg) => applyMinimaxApiConfig(cfg, "MiniMax-M2.7"),
  },
  "minimax-cn": {
    provider: applyMinimaxApiProviderConfigCn,
    defaultModel: (cfg) => applyMinimaxApiConfigCn(cfg, "MiniMax-M2.7"),
  },
  "minimax-portal": {
    provider: applyMinimaxPortalProviderConfig,
    defaultModel: (cfg) =>
      applyAgentDefaultPrimary(applyMinimaxPortalProviderConfig(cfg), "minimax-portal/MiniMax-M2.7"),
  },
  mistral: {
    provider: applyMistralProviderConfig,
    defaultModel: applyMistralConfig,
  },
  modelstudio: {
    provider: applyModelStudioProviderConfig,
    defaultModel: applyModelStudioConfig,
  },
  "modelstudio-cn": {
    provider: applyModelStudioProviderConfigCn,
    defaultModel: applyModelStudioConfigCn,
  },
  moonshot: {
    provider: applyMoonshotProviderConfig,
    defaultModel: applyMoonshotConfig,
  },
  "moonshot-cn": {
    provider: applyMoonshotProviderConfigCn,
    defaultModel: applyMoonshotConfigCn,
  },
  opencode: {
    provider: applyOpencodeZenProviderConfig,
    defaultModel: applyOpencodeZenConfig,
  },
  "opencode-go": {
    provider: applyOpencodeGoProviderConfig,
    defaultModel: applyOpencodeGoConfig,
  },
  openrouter: {
    provider: applyOpenrouterProviderConfig,
    defaultModel: applyOpenrouterConfig,
  },
  qianfan: {
    provider: applyQianfanProviderConfig,
    defaultModel: applyQianfanConfig,
  },
  synthetic: {
    provider: applySyntheticProviderConfig,
    defaultModel: applySyntheticConfig,
  },
  together: {
    provider: applyTogetherProviderConfig,
    defaultModel: applyTogetherConfig,
  },
  venice: {
    provider: applyVeniceProviderConfig,
    defaultModel: applyVeniceConfig,
  },
  xai: {
    provider: applyXaiProviderConfig,
    defaultModel: applyXaiConfig,
  },
  xiaomi: {
    provider: applyXiaomiProviderConfig,
    defaultModel: applyXiaomiConfig,
  },
  zai: {
    provider: applyZaiProviderConfig,
    defaultModel: applyZaiConfig,
  },
};

export function applyKnownProviderConfig(
  config: OpenClawConfig,
  providerId: string,
  mode: "provider" | "default-model",
): OpenClawConfig {
  const appliers = PROVIDER_APPLIERS[providerId];
  if (!appliers) {
    return config;
  }
  return mode === "provider" ? appliers.provider(config) : appliers.defaultModel(config);
}
