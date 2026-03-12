import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * 解析 openclaw 配置文件路径。
 * 与 CLI 保持一致：~/.openclaw/config.json（或 OPENCLAW_CONFIG_DIR 覆盖）
 */
function resolveConfigPath(): string {
  const override = process.env.OPENCLAW_CONFIG_DIR?.trim();
  const baseDir = override || path.join(os.homedir(), ".openclaw");
  return path.join(baseDir, "config.json");
}

/**
 * 检测是否为首次启动（未完成配置）。
 * 与 macOS shouldSkipWizard() 逻辑对齐：
 *   - 配置文件中存在非空 wizard 节 → 已完成
 *   - gateway.auth.mode / token / password 任一有值 → 已完成
 *   - gateway.mode 为 "local" 或 "remote" → 已完成
 * 以上均不满足则视为首次启动。
 */
export function isFirstLaunch(): boolean {
  const cfgPath = resolveConfigPath();
  try {
    const raw = fs.readFileSync(cfgPath, "utf8");
    const cfg = JSON.parse(raw) as Record<string, unknown>;

    // 存在非空 wizard 节 → 向导已完成过
    const wizard = cfg?.wizard;
    if (wizard && typeof wizard === "object" && Object.keys(wizard).length > 0) {
      return false;
    }

    const gateway = cfg?.gateway as Record<string, unknown> | undefined;

    // gateway.auth.mode / token / password 任一有值 → 已配置
    const auth = gateway?.auth as Record<string, unknown> | undefined;
    if (auth) {
      const hasMode = typeof auth.mode === "string" && auth.mode.trim().length > 0;
      const hasToken = typeof auth.token === "string" && auth.token.trim().length > 0;
      const hasPassword = typeof auth.password === "string" && auth.password.trim().length > 0;
      if (hasMode || hasToken || hasPassword) {
        return false;
      }
    }

    // gateway.mode 为 local 或 remote → 已配置
    const gatewayMode = gateway?.mode;
    if (gatewayMode === "local" || gatewayMode === "remote") {
      return false;
    }

    return true;
  } catch {
    // 文件不存在或解析失败 → 首次启动
    return true;
  }
}
