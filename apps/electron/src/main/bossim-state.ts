import os from "node:os";
import path from "node:path";

const BOSSIM_DIR_NAME = ".bossim";
const OPENCLAW_DIR_NAME = ".openclaw";

/**
 * Bossim 工作空间目录解析。
 *
 * 设计意图：Bossim 必须与并存的 CLI `openclaw`（默认 `~/.openclaw`）目录隔离，
 * 否则会共用配置、agent、credentials、workspace、logs、tmp lock。
 *
 * 解析顺序：
 *   1. `BOSSIM_USE_OPENCLAW_STATE=1`  → `~/.openclaw`（dev escape hatch，联调 CLI 用）
 *   2. `BOSSIM_STATE_DIR`             → 任意路径覆盖
 *   3. 默认                            → `~/.bossim`
 *
 * 主进程在 `app.whenReady()` **之前**调用 `installBossimStateDirEnv()`，
 * 把解析结果写入 `process.env.OPENCLAW_STATE_DIR`，这样：
 *   - 主进程内所有派生路径直接读 `BOSSIM_STATE_DIR`；
 *   - spawn 出的子 Gateway 通过继承 env，让 `src/config/paths.ts` 的
 *     `resolveStateDir()` 自动落到 `.bossim`，core 无需改动。
 */

export function resolveBossimStateDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  if (env.BOSSIM_USE_OPENCLAW_STATE === "1") {
    return path.join(homedir(), OPENCLAW_DIR_NAME);
  }
  const override = env.BOSSIM_STATE_DIR?.trim();
  if (override) {
    return path.isAbsolute(override) ? override : path.resolve(override);
  }
  return path.join(homedir(), BOSSIM_DIR_NAME);
}

/** True when Bossim is intentionally redirected back to the CLI `.openclaw` dir. */
export function isUsingOpenclawState(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BOSSIM_USE_OPENCLAW_STATE === "1";
}

/** Filesystem name of the legacy CLI state dir (without leading dot stripped). */
export function legacyOpenclawStateDir(homedir: () => string = os.homedir): string {
  return path.join(homedir(), OPENCLAW_DIR_NAME);
}

/**
 * Set on first import and frozen for the lifetime of the Electron process.
 * Importers should reference this rather than recomputing.
 */
export const BOSSIM_STATE_DIR = resolveBossimStateDir();

/**
 * Default agent workspace directory (string written into config, tilde form for portability).
 * Mirrors the state-dir selection: stays `~/.openclaw/workspace` only when the
 * escape hatch is active so dev-against-CLI keeps working unchanged.
 */
export const DEFAULT_AGENT_WORKSPACE_TILDE = isUsingOpenclawState()
  ? "~/.openclaw/workspace"
  : "~/.bossim/workspace";

/**
 * Push the resolved state dir into the environment so child processes
 * (notably the spawned Gateway) inherit it through `OPENCLAW_STATE_DIR`.
 * Call once, as early as possible in main process bootstrap.
 */
export function installBossimStateDirEnv(): string {
  process.env.OPENCLAW_STATE_DIR = BOSSIM_STATE_DIR;
  return BOSSIM_STATE_DIR;
}
