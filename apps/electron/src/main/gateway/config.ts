import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const CONFIG_FILENAMES = [
  "openclaw.json",
  "openclaw.json5",
  "config.json",
  "clawdbot.json",
] as const;

function resolveConfigPath(): string | null {
  const explicitPath =
    process.env.OPENCLAW_CONFIG_PATH?.trim() ||
    process.env.CLAWDBOT_CONFIG_PATH?.trim();
  if (explicitPath && fs.existsSync(explicitPath)) {
    return explicitPath;
  }
  const stateDir =
    process.env.OPENCLAW_STATE_DIR?.trim() ||
    path.join(os.homedir(), ".openclaw");
  for (const name of CONFIG_FILENAMES) {
    const p = path.join(stateDir, name);
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

/** Parsed user config, or null when missing/unreadable. */
export function loadUserOpenClawConfig(): Record<string, unknown> | null {
  const cfgPath = resolveConfigPath();
  if (!cfgPath) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(cfgPath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 从用户现有配置中读取 Gateway token。
 * 如果已配置则复用，保证 UI localStorage 里存的 token 仍均有效。
 */
export function readExistingGatewayToken(): string | null {
  const cfg = loadUserOpenClawConfig();
  if (!cfg) {
    return null;
  }
  const gw = cfg.gateway as Record<string, unknown> | undefined;
  const auth = gw?.auth as Record<string, unknown> | undefined;
  const token = auth?.token;
  return typeof token === "string" && token.trim() ? token.trim() : null;
}

/** 从用户现有配置中读取 Gateway 端口；未配置则返回 null。 */
export function readExistingGatewayPort(): number | null {
  const cfg = loadUserOpenClawConfig();
  if (!cfg) {
    return null;
  }
  const gw = cfg.gateway as Record<string, unknown> | undefined;
  const port = gw?.port;
  if (typeof port === "number" && port > 0) {
    return port;
  }
  if (typeof port === "string" && Number(port) > 0) {
    return Number(port);
  }
  return null;
}
