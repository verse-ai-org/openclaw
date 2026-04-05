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

/**
 * Structured gateway log line for easier grep/filter.
 * Example: [gateway][spawn] port=18789 force=false
 */
function logEvent(event: string, fields?: Record<string, unknown>): void {
  if (!fields || Object.keys(fields).length === 0) {
    log(`[gateway][${event}]`);
    return;
  }
  const kv = Object.entries(fields)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");
  log(`[gateway][${event}] ${kv}`);
}

/**
 * Normalise child process output so each line is independently prefixed.
 */
function writeChildStream(tag: "stdout" | "stderr", text: string): void {
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    if (tag === "stdout") {
      process.stdout.write(`[gateway:${tag}] ${line}\n`);
    } else {
      process.stderr.write(`[gateway:${tag}] ${line}\n`);
    }
    mainLogSync(`[gateway:${tag}] ${line}`);
  }
}

/**
 * 启动时扫描并报告 bundled extensions 的状态。
 * 帮助诊断"plugin not found"问题。
 */
function auditBundledExtensions(): void {
  const extensionsDir = app.isPackaged
    ? path.join(process.resourcesPath, "openclaw", "extensions")
    : path.resolve(__dirname, "../../../../extensions");

  if (!fs.existsSync(extensionsDir)) {
    logEvent("audit-extensions", { status: "missing", path: extensionsDir });
    return;
  }

  try {
    const entries = fs.readdirSync(extensionsDir, { withFileTypes: true });
    const extensions: Array<{
      id: string;
      hasManifest: boolean;
      hasPackageJson: boolean;
    }> = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const id = entry.name;
      const extDir = path.join(extensionsDir, id);
      const manifestPath = path.join(extDir, "openclaw.plugin.json");
      const packagePath = path.join(extDir, "package.json");

      extensions.push({
        id,
        hasManifest: fs.existsSync(manifestPath),
        hasPackageJson: fs.existsSync(packagePath),
      });
    }

    const summary = extensions
      .map(
        (e) =>
          `${e.id}(manifest=${e.hasManifest ? "✓" : "✗"} pkg=${e.hasPackageJson ? "✓" : "✗"})`,
      )
      .join(" ");

    logEvent("audit-extensions", {
      status: "ok",
      count: extensions.length,
      list: summary,
    });
  } catch (err) {
    logEvent("audit-extensions", {
      status: "error",
      error: String(err),
    });
  }
}

/**
 * 检查配置中引用的插件是否存在。
 */
function auditConfigPlugins(cfg: Record<string, unknown>): void {
  const plugins = cfg.plugins as Record<string, unknown> | undefined;
  if (!plugins) {
    logEvent("audit-config-plugins", { status: "no-plugins-section" });
    return;
  }

  const entries = (plugins.entries as Record<string, unknown>) ?? {};
  const entryIds = Object.keys(entries);

  if (entryIds.length === 0) {
    logEvent("audit-config-plugins", { status: "no-entries" });
    return;
  }

  const extensionsDir = app.isPackaged
    ? path.join(process.resourcesPath, "openclaw", "extensions")
    : path.resolve(__dirname, "../../../../extensions");

  const missing: string[] = [];
  const found: string[] = [];

  for (const id of entryIds) {
    const extDir = path.join(extensionsDir, id);
    const manifestPath = path.join(extDir, "openclaw.plugin.json");
    if (fs.existsSync(manifestPath)) {
      found.push(id);
    } else {
      missing.push(id);
    }
  }

  logEvent("audit-config-plugins", {
    status: missing.length === 0 ? "ok" : "missing",
    total: entryIds.length,
    found: found.length,
    missing: missing.length > 0 ? missing.join(",") : undefined,
  });
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
  if (process.platform === "win32") {
    _loginShellEnv = {};
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
      log(
        `[gateway] resolveLoginShellEnv: loaded ${Object.keys(result).length} vars from login shell`,
      );
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
let _onGatewayCrash:
  | ((code: number | null, signal: NodeJS.Signals | null) => void)
  | null = null;

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
    const nodeName = process.platform === "win32" ? "node.exe" : "node";
    const p = path.join(process.resourcesPath, "node", nodeName);
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
  logEvent("start-gateway", { phase: "begin" });

  // 审计 bundled extensions 和配置中的插件引用
  auditBundledExtensions();

  const existingToken = readExistingGatewayToken();
  const configPort = readExistingGatewayPort() ?? DEFAULT_GATEWAY_PORT;

  // 读取配置并审计
  const cfgPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as Record<
        string,
        unknown
      >;
      auditConfigPlugins(cfg);
    } catch (err) {
      logEvent("audit-config-plugins", {
        status: "parse-error",
        error: String(err),
      });
    }
  }

  if (existingToken) {
    // 有配置 token，尝试复用已有 Gateway
    gatewayToken = existingToken;
    const running = await isGatewayRunning(configPort);
    if (running) {
      logEvent("reuse-gateway", { port: configPort });
      reusingExternalGateway = true;
      _activePort = configPort;
      return;
    }
    // 未运行，在配置端口启动（不带 --force，不干扰其他端口上的进程）
    logEvent("spawn-gateway", {
      port: configPort,
      force: false,
      reason: "config-port-no-instance",
    });
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
    logEvent("spawn-gateway", { port, force: true, reason: "no-config-token" });
    await spawnGateway({ port, token: opts.token, force: true });
  }

  logEvent("start-gateway", { phase: "complete", port: _activePort });
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
    logEvent("path-check", {
      node: nodeExists ? "✓" : "✗",
      entry: entryExists ? "✓" : "✗",
    });
    if (!nodeExists || !entryExists) {
      logEvent("path-check-failed", {
        node: nodeBin,
        entry: openclawEntry,
      });
      throw new Error(`打包资源缺失: node=${nodeExists}, entry=${entryExists}`);
    }
    // 列出 Resources 目录帮助调试
    try {
      const resourcesDir = process.resourcesPath;
      const topItems = fs.readdirSync(resourcesDir);
      logEvent("resources-dir", {
        count: topItems.length,
        items: topItems.slice(0, 10).join(","),
      });
    } catch (e) {
      logEvent("resources-dir-error", { error: String(e) });
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
    args.push("--force");
  }

  logEvent("spawn", {
    node: nodeBin,
    entry: openclawEntry,
    port: opts.port,
    force: opts.force,
    cwd: path.dirname(openclawEntry),
  });

  // Merge login shell env (already cached by warmLoginShellEnv) so that
  // variables set in ~/.zshrc / ~/.bash_profile (API keys, custom PATH, etc.)
  // are visible to the Gateway subprocess. process.env takes precedence over
  // the shell snapshot so any explicit Electron env overrides are preserved.
  const shellEnv = _loginShellEnv ?? {};

  // Ensure bundled Node is discoverable by runtime exec commands.
  // This makes `exec` commands like `node script.mjs` work in packaged apps
  // even when GUI login shell PATH does not include a system Node install.
  const packagedNodeDir = app.isPackaged
    ? path.join(process.resourcesPath, "node")
    : null;
  const basePath =
    process.env.PATH ?? shellEnv.PATH ?? "/usr/local/bin:/usr/bin:/bin";
  const mergedPath =
    packagedNodeDir != null
      ? `${packagedNodeDir}${path.delimiter}${basePath}`
      : basePath;

  gatewayProcess = spawn(nodeBin, args, {
    cwd: path.dirname(openclawEntry),
    env: {
      HOME: os.homedir(),
      ...shellEnv,
      ...process.env,
      PATH: mergedPath,
      // Token 通过环境变量注入，不出现在进程参数里
      OPENCLAW_GATEWAY_TOKEN: opts.token,
      OPENCLAW_GATEWAY_PORT: String(opts.port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  gatewayProcess.stdout?.on("data", (data: Buffer) => {
    writeChildStream("stdout", data.toString());
  });

  gatewayProcess.stderr?.on("data", (data: Buffer) => {
    writeChildStream("stderr", data.toString());
  });

  gatewayProcess.on("exit", (code, signal) => {
    logEvent("exit", { code, signal });
    gatewayProcess = null;
    // Distinguish deliberate stop (SIGTERM from stopGateway) from unexpected crashes.
    // Reusing an external Gateway is never managed by us, so no crash notification.
    if (
      !_intentionalStop &&
      !reusingExternalGateway &&
      (code !== 0 || (signal !== null && signal !== "SIGTERM"))
    ) {
      logEvent("crash", {
        code,
        signal,
        intentionalStop: _intentionalStop,
        reusingExternal: reusingExternalGateway,
      });
      _onGatewayCrash?.(code, signal);
    }
    _intentionalStop = false;
  });

  gatewayProcess.on("error", (err) => {
    logEvent("spawn-error", { error: err.message });
  });

  logEvent("wait-ready", {
    port: opts.port,
    timeoutMs: GATEWAY_READY_TIMEOUT_MS,
  });
  await waitForGatewayReady(opts.port, GATEWAY_READY_TIMEOUT_MS);
  logEvent("ready", { port: opts.port });
}

/**
 * 停止 Gateway 子进程。
 * 若复用的是外部已有 Gateway，则不执行任何操作。
 */
export function stopGateway(): void {
  if (reusingExternalGateway) {
    logEvent("stop", { status: "skipped", reason: "reusing-external" });
    return;
  }
  if (!gatewayProcess) {
    logEvent("stop", { status: "skipped", reason: "no-process" });
    return;
  }
  logEvent("stop", { status: "sending-sigterm" });
  _intentionalStop = true;
  gatewayProcess.kill("SIGTERM");
  gatewayProcess = null;
}

/**
 * 重启 Gateway（配置更新后调用）。
 * 若当前为复用外部 Gateway，则仍复用（不重启）。
 */
export async function restartGateway(opts: GatewayStartOptions): Promise<void> {
  logEvent("restart", { phase: "begin", port: _activePort });
  if (reusingExternalGateway) {
    logEvent("restart", { status: "skipped", reason: "reusing-external" });
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
  logEvent("restart", { phase: "spawning", port });
  await spawnGateway({ port, token, force: true });
  logEvent("restart", { phase: "complete", port });
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
