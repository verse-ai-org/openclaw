import { spawn, ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { app } from "electron";
import { mainLogSync } from "./onboarding.js";

/**
 * 同时写 console + 日志文件（打包后 console 不可见）。
 */
function log(msg: string): void {
  console.log(msg);
  mainLogSync(msg);
}
function logError(msg: string, err?: unknown): void {
  const detail =
    err instanceof Error
      ? ` ${err.message}`
      : err !== undefined
        ? ` ${String(err)}`
        : "";
  console.error(msg + detail);
  mainLogSync(`[ERROR] ${msg}${detail}`);
}

const DEFAULT_GATEWAY_PORT = 18789;

/**
 * Cache for the login shell environment variables.
 * Populated once at startup; undefined means not yet resolved.
 */
let _loginShellEnv: Record<string, string> | null = null;

/**
 * Reads environment variables from the user's login shell (bash -l).
 * This is necessary on macOS packaged apps where process.env lacks PATH
 * entries from ~/.zshrc / ~/.bash_profile (Homebrew, nvm, API keys, etc.).
 *
 * Falls back to an empty object on failure — callers always spread process.env
 * as a baseline, so the fallback is safe.
 */
async function resolveLoginShellEnv(): Promise<Record<string, string>> {
  if (_loginShellEnv !== null) {
    return _loginShellEnv;
  }
  return new Promise((resolve) => {
    // Use login shell so ~/.zshrc / ~/.bash_profile / ~/.profile are sourced.
    const shell = process.env.SHELL ?? "/bin/bash";
    const child = spawn(shell, ["-l", "-c", "env"], {
      env: { HOME: os.homedir(), PATH: process.env.PATH ?? "" },
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("close", () => {
      const result: Record<string, string> = {};
      for (const line of output.split("\n")) {
        const eq = line.indexOf("=");
        if (eq > 0) {
          const key = line.slice(0, eq);
          const val = line.slice(eq + 1);
          result[key] = val;
        }
      }
      _loginShellEnv = result;
      log(`[gateway] resolveLoginShellEnv: loaded ${Object.keys(result).length} vars from login shell`);
      resolve(result);
    });
    child.on("error", (err) => {
      logError("[gateway] resolveLoginShellEnv failed:", err);
      _loginShellEnv = {};
      resolve({});
    });
  });
}

/**
 * Pre-warms the login shell env cache. Call once at app startup so
 * spawnGateway() doesn't have to wait for it.
 */
export async function warmLoginShellEnv(): Promise<void> {
  await resolveLoginShellEnv();
}
const GATEWAY_READY_TIMEOUT_MS = 15_000;
const GATEWAY_READY_POLL_MS = 200;

/** Optional callback invoked when the self-managed Gateway process crashes unexpectedly. */
let _onGatewayCrash: ((code: number | null, signal: NodeJS.Signals | null) => void) | null = null;

/**
 * Register a callback that fires when the Gateway subprocess exits with a
 * non-zero code and it was not caused by a deliberate stopGateway() call.
 * The callback is typically used by the Electron main process to notify the
 * renderer (via webContents.send) so the UI can show a reconnect prompt.
 */
export function onGatewayCrash(
  cb: (code: number | null, signal: NodeJS.Signals | null) => void,
): void {
  _onGatewayCrash = cb;
}

/** Set to true just before a deliberate SIGTERM so exit handler can distinguish. */
let _intentionalStop = false;
let gatewayProcess: ChildProcess | null = null;
let gatewayToken = "";
/** 当前实际使用的 Gateway 端口 */
let _activePort = DEFAULT_GATEWAY_PORT;
/** 是否复用了外部已有的 Gateway（不由 Electron 管理） */
let reusingExternalGateway = false;

export interface GatewayStartOptions {
  port?: number;
  token: string;
}

/**
 * 解析捆绑的 Node 22 二进制路径。
 * - 打包后：Resources/node/node（通过 extraResources 捆绑）
 * - 开发时：系统 PATH 中的 node（要求本地已安装 Node >=22）
 */
function resolveBundledNode(): string {
  if (app.isPackaged) {
    const p = path.join(process.resourcesPath, "node", "node");
    const exists = fs.existsSync(p);
    log(`[gateway] resolveBundledNode (packaged): ${p} exists=${exists}`);
    return p;
  }
  // 开发时使用系统 node
  const devPath = process.execPath.includes("electron")
    ? "node"
    : process.execPath;
  log(`[gateway] resolveBundledNode (dev): ${devPath}`);
  return devPath;
}

/**
 * 解析 openclaw CLI 入口文件路径。
 * - 打包后：Resources/openclaw/openclaw.mjs
 * - 开发时：repo root 的 openclaw.mjs
 *
 * 目录结构：
 *   apps/electron/dist/main/index.js  (__dirname)
 *   apps/electron/dist/                (../)
 *   apps/electron/                     (../../)
 *   apps/                              (../../../)
 *   repo root/                         (../../../../)
 */
function resolveOpenclaw(): string {
  if (app.isPackaged) {
    const p = path.join(process.resourcesPath, "openclaw", "openclaw.mjs");
    const exists = fs.existsSync(p);
    log(`[gateway] resolveOpenclaw (packaged): ${p} exists=${exists}`);
    return p;
  }
  // 开发时：__dirname = dist/main/，向上 4 级到 repo root
  const devPath = path.resolve(__dirname, "../../../../openclaw.mjs");
  const exists = fs.existsSync(devPath);
  log(`[gateway] resolveOpenclaw (dev): ${devPath} exists=${exists}`);
  return devPath;
}

/**
 * 从用户现有配置中读取 Gateway token。
 * 如果已配置则复用，保证 UI localStorage 里存的 token 仍均有效。
 * 如果未配置则返回 null，由调用方自行生成。
 */
export function readExistingGatewayToken(): string | null {
  const explicitPath =
    process.env.OPENCLAW_CONFIG_PATH?.trim() ||
    process.env.CLAWDBOT_CONFIG_PATH?.trim();
  const stateDir =
    process.env.OPENCLAW_STATE_DIR?.trim() ||
    path.join(os.homedir(), ".openclaw");
  const candidates = [
    "openclaw.json",
    "openclaw.json5",
    "config.json",
    "clawdbot.json",
  ];
  let cfg: Record<string, unknown> = {};
  if (explicitPath && fs.existsSync(explicitPath)) {
    try {
      cfg = JSON.parse(fs.readFileSync(explicitPath, "utf8")) as Record<
        string,
        unknown
      >;
    } catch {
      return null;
    }
  } else {
    for (const name of candidates) {
      const p = path.join(stateDir, name);
      if (fs.existsSync(p)) {
        try {
          cfg = JSON.parse(fs.readFileSync(p, "utf8")) as Record<
            string,
            unknown
          >;
          break;
        } catch {
          return null;
        }
      }
    }
  }
  const gw = cfg.gateway as Record<string, unknown> | undefined;
  const auth = gw?.auth as Record<string, unknown> | undefined;
  const token = auth?.token;
  return typeof token === "string" && token.trim() ? token.trim() : null;
}

/**
 * 从用户现有配置中读取 Gateway 端口。
 * 如果未配置则返回 null。
 */
export function readExistingGatewayPort(): number | null {
  const explicitPath =
    process.env.OPENCLAW_CONFIG_PATH?.trim() ||
    process.env.CLAWDBOT_CONFIG_PATH?.trim();
  const stateDir =
    process.env.OPENCLAW_STATE_DIR?.trim() ||
    path.join(os.homedir(), ".openclaw");
  const candidates = [
    "openclaw.json",
    "openclaw.json5",
    "config.json",
    "clawdbot.json",
  ];
  let cfg: Record<string, unknown> = {};
  if (explicitPath && fs.existsSync(explicitPath)) {
    try {
      cfg = JSON.parse(fs.readFileSync(explicitPath, "utf8")) as Record<
        string,
        unknown
      >;
    } catch {
      return null;
    }
  } else {
    for (const name of candidates) {
      const p = path.join(stateDir, name);
      if (fs.existsSync(p)) {
        try {
          cfg = JSON.parse(fs.readFileSync(p, "utf8")) as Record<
            string,
            unknown
          >;
          break;
        } catch {
          return null;
        }
      }
    }
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

/**
 * 探测指定端口是否已有 Gateway 就绪。
 */
async function isGatewayRunning(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function waitForGatewayReady(
  port: number,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const url = `http://127.0.0.1:${port}/`;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      // Gateway 返回任何非 5xx 状态都视为就绪
      if (res.status < 500) {
        return;
      }
    } catch {
      // 连接被拒绝或超时，继续等待
    }
    await new Promise((resolve) => setTimeout(resolve, GATEWAY_READY_POLL_MS));
  }
  throw new Error(`Gateway 未能在 ${timeoutMs}ms 内在端口 ${port} 上就绪`);
}

/**
 * 启动 openclaw gateway 子进程，等待就绪后返回。
 *
 * 复用策略：
 *   1. 若配置文件中存在 token（用户已配置 Gateway）：
 *      - 探测配置端口（或默认 18789），已在运行 → 直接复用，不启动子进程
 *      - 未运行 → 在原配置端口启动（不带 --force，避免干扰其他进程）
 *   2. 若配置文件中没有 token（未配置）：
 *      - 在独立端口 18790 启动（带 --force 仅针对该端口），使用随机 token
 */
export async function startGateway(opts: GatewayStartOptions): Promise<void> {
  const existingToken = readExistingGatewayToken();
  const configPort = readExistingGatewayPort() ?? DEFAULT_GATEWAY_PORT;

  if (existingToken) {
    // 有配置 token，尝试复用已有 Gateway
    gatewayToken = existingToken;
    const running = await isGatewayRunning(configPort);
    if (running) {
      log(`[gateway] 检测到端口 ${configPort} 已有 Gateway 运行，复用现有实例`);
      reusingExternalGateway = true;
      _activePort = configPort;
      return;
    }
    // 未运行，在配置端口启动（不带 --force，不干扰其他端口上的进程）
    log(`[gateway] 配置端口 ${configPort} 无运行实例，启动新 Gateway`);
    _activePort = configPort;
    await spawnGateway({
      port: configPort,
      token: existingToken,
      force: false,
    });
  } else {
    // 无配置 token，在默认端口 18789 启动（带 --force），使用调用方提供的随机 token
    const port = opts.port ?? DEFAULT_GATEWAY_PORT;
    gatewayToken = opts.token;
    _activePort = port;
    log(`[gateway] 无现有配置，在端口 ${port} 启动 Gateway`);
    await spawnGateway({ port, token: opts.token, force: true });
  }
}

async function spawnGateway(opts: {
  port: number;
  token: string;
  force: boolean;
}): Promise<void> {
  const nodeBin = resolveBundledNode();
  const openclawEntry = resolveOpenclaw();

  // 打包后验证关键路径是否存在
  if (app.isPackaged) {
    const nodeExists = fs.existsSync(nodeBin);
    const entryExists = fs.existsSync(openclawEntry);
    log(`[gateway] 路径检查: node=${nodeBin} exists=${nodeExists}`);
    log(`[gateway] 路径检查: entry=${openclawEntry} exists=${entryExists}`);
    if (!nodeExists || !entryExists) {
      logError(
        `[gateway] 关键文件缺失！node=${nodeExists} entry=${entryExists}`,
      );
      throw new Error(`打包资源缺失: node=${nodeExists}, entry=${entryExists}`);
    }
    // 列出 Resources 目录帮助调试
    try {
      const resourcesDir = process.resourcesPath;
      const topItems = fs.readdirSync(resourcesDir);
      log(`[gateway] Resources/ 目录内容: ${topItems.join(", ")}`);
    } catch (e) {
      log(`[gateway] 无法列出 Resources/: ${e}`);
    }
  }

  const args = [
    openclawEntry,
    "gateway",
    "run",
    "--port",
    String(opts.port),
    "--allow-unconfigured",
  ];
  if (opts.force) {
    // --force: 自动 kill 占用同端口的已有进程
    args.push("--force");
  }

  log(`[gateway] 启动: ${nodeBin} ${args.join(" ")}`);

  // Merge login shell env (already cached by warmLoginShellEnv) so that
  // variables set in ~/.zshrc / ~/.bash_profile (API keys, custom PATH, etc.)
  // are visible to the Gateway subprocess. process.env takes precedence over
  // the shell snapshot so any explicit Electron env overrides are preserved.
  const shellEnv = _loginShellEnv ?? {};
  gatewayProcess = spawn(nodeBin, args, {
    env: {
      HOME: os.homedir(),
      ...shellEnv,
      ...process.env,
      // Token 通过环境变量注入，不出现在进程参数里
      OPENCLAW_GATEWAY_TOKEN: opts.token,
      OPENCLAW_GATEWAY_PORT: String(opts.port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  gatewayProcess.stdout?.on("data", (data: Buffer) => {
    const text = data.toString();
    process.stdout.write(`[gateway] ${text}`);
    mainLogSync(`[gateway:stdout] ${text.trimEnd()}`);
  });

  gatewayProcess.stderr?.on("data", (data: Buffer) => {
    const text = data.toString();
    process.stderr.write(`[gateway] ${text}`);
    mainLogSync(`[gateway:stderr] ${text.trimEnd()}`);
  });

  gatewayProcess.on("exit", (code, signal) => {
    log(`[gateway] 进程退出 code=${code} signal=${signal}`);
    gatewayProcess = null;
    // Distinguish deliberate stop (SIGTERM from stopGateway) from unexpected crashes.
    // Reusing an external Gateway is never managed by us, so no crash notification.
    if (!_intentionalStop && !reusingExternalGateway && (code !== 0 || signal !== null && signal !== "SIGTERM")) {
      log(`[gateway] 意外崩溃，触发 onGatewayCrash 回调 code=${code} signal=${signal}`);
      _onGatewayCrash?.(code, signal);
    }
    _intentionalStop = false;
  });

  gatewayProcess.on("error", (err) => {
    logError("[gateway] 启动失败:", err);
  });

  log(`[gateway] 等待就绪中，端口 ${opts.port}…`);
  await waitForGatewayReady(opts.port, GATEWAY_READY_TIMEOUT_MS);
  log(`[gateway] 就绪，端口 ${opts.port}`);
}

/**
 * 停止 Gateway 子进程。
 * 若复用的是外部已有 Gateway，则不执行任何操作。
 */
export function stopGateway(): void {
  if (reusingExternalGateway) {
    log("[gateway] 复用外部 Gateway，跳过停止操作");
    return;
  }
  if (!gatewayProcess) {
    return;
  }
  log("[gateway] 正在停止...");
  _intentionalStop = true;
  gatewayProcess.kill("SIGTERM");
  gatewayProcess = null;
}

/**
 * 重启 Gateway（配置更新后调用）。
 * 若当前为复用外部 Gateway，则仍复用（不重启）。
 */
export async function restartGateway(opts: GatewayStartOptions): Promise<void> {
  if (reusingExternalGateway) {
    console.log("[gateway] 复用外部 Gateway，跳过重启操作");
    return;
  }
  stopGateway();
  // 等待端口释放
  await new Promise((resolve) => setTimeout(resolve, 800));

  // 重启时始终用 force=true，避免旧进程残留占端口。
  // 同时直接用 spawnGateway 绕过 readExistingGatewayToken() 分支，
  // 确保使用调用方传入的最新 token，并强制在同端口上启动。
  const port = _activePort;
  const token = opts.token || gatewayToken;
  gatewayToken = token;
  log(`[gateway] 重启 Gateway，port=${port}`);
  await spawnGateway({ port, token, force: true });
}

export function getGatewayToken(): string {
  // When reusing an external Gateway the token may rotate (e.g. the user
  // restarted the CLI gateway with a new config). Re-read from disk every time
  // so the Electron UI always sends a valid token without requiring an app
  // restart. For self-managed gateways we generated the token ourselves and
  // it never changes, so we return the cached value directly.
  if (reusingExternalGateway) {
    const fresh = readExistingGatewayToken();
    if (fresh && fresh !== gatewayToken) {
      log(`[gateway] getGatewayToken: token rotated, updating cached value`);
      gatewayToken = fresh;
    }
  }
  return gatewayToken;
}

/** 返回当前实际使用的 Gateway 端口（复用外部时为配置端口，否则为启动时指定端口）。 */
export function getGatewayPort(): number {
  return _activePort;
}
