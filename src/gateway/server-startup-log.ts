import chalk from "chalk";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../agents/defaults.js";
import { resolveConfiguredModelRef } from "../agents/model-selection.js";
import type { loadConfig } from "../config/config.js";
import { getResolvedLoggerSettings } from "../logging.js";
import { parseBooleanValue } from "../utils/boolean.js";
import { collectEnabledInsecureOrDangerousFlags } from "../security/dangerous-config-flags.js";

const CACHE_TRACE_ENV_HINT = process.env.OPENCLAW_CACHE_TRACE;

function resolveCacheTraceStatus(): string {
  const envVal = parseBooleanValue(CACHE_TRACE_ENV_HINT);
  if (envVal === true) {
    return chalk.greenBright("enabled") + chalk.gray(" (OPENCLAW_CACHE_TRACE=true)");
  }
  if (CACHE_TRACE_ENV_HINT && envVal === undefined) {
    return chalk.yellow("ignored") + chalk.gray(` (OPENCLAW_CACHE_TRACE=${JSON.stringify(CACHE_TRACE_ENV_HINT)}, not a truthy value)`);
  }
  return chalk.dim("disabled") + chalk.gray(" (set OPENCLAW_CACHE_TRACE=true to enable)");
}

export function logGatewayStartup(params: {
  cfg: ReturnType<typeof loadConfig>;
  bindHost: string;
  bindHosts?: string[];
  port: number;
  tlsEnabled?: boolean;
  log: { info: (msg: string, meta?: Record<string, unknown>) => void; warn: (msg: string) => void };
  isNixMode: boolean;
}) {
  const { provider: agentProvider, model: agentModel } = resolveConfiguredModelRef({
    cfg: params.cfg,
    defaultProvider: DEFAULT_PROVIDER,
    defaultModel: DEFAULT_MODEL,
  });
  const modelRef = `${agentProvider}/${agentModel}`;
  params.log.info(`agent model: ${modelRef}`, {
    consoleMessage: `agent model: ${chalk.whiteBright(modelRef)}`,
  });
  const scheme = params.tlsEnabled ? "wss" : "ws";
  const formatHost = (host: string) => (host.includes(":") ? `[${host}]` : host);
  const hosts =
    params.bindHosts && params.bindHosts.length > 0 ? params.bindHosts : [params.bindHost];
  const listenEndpoints = hosts.map((host) => `${scheme}://${formatHost(host)}:${params.port}`);
  params.log.info(`listening on ${listenEndpoints.join(", ")} (PID ${process.pid})`);
  params.log.info(`log file: ${getResolvedLoggerSettings().file}`);
  params.log.info(`cache trace: ${resolveCacheTraceStatus()}`, {
    consoleMessage: `cache trace: ${resolveCacheTraceStatus()}`,
  });
  if (params.isNixMode) {
    params.log.info("gateway: running in Nix mode (config managed externally)");
  }

  const enabledDangerousFlags = collectEnabledInsecureOrDangerousFlags(params.cfg);
  if (enabledDangerousFlags.length > 0) {
    const warning =
      `security warning: dangerous config flags enabled: ${enabledDangerousFlags.join(", ")}. ` +
      "Run `openclaw security audit`.";
    params.log.warn(warning);
  }
}
