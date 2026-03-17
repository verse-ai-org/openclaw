import { spawn, ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { app } from "electron";

const DEFAULT_GATEWAY_PORT = 18789;
const GATEWAY_READY_TIMEOUT_MS = 15_000;
const GATEWAY_READY_POLL_MS = 200;

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
    return path.join(process.resourcesPath, "node", "node");
  }
  // 开发时使用系统 node
  return process.execPath.includes("electron") ? "node" : process.execPath;
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
    return path.join(process.resourcesPath, "openclaw", "openclaw.mjs");
  }
  // 开发时：__dirname = dist/main/，向上 4 级到 repo root
  return path.resolve(__dirname, "../../../../openclaw.mjs");
}

/**
 * 从用户现有配置中读取 Gateway token。
 * 如果已配置则复用，保证 UI localStorage 里存的 token 仍均有效。
 * 如果未配置则返回 null，由调用方自行生成。
 */
export function readExistingGatewayToken(): string | null {
  const explicitPath = process.env.OPENCLAW_CONFIG_PATH?.trim() || process.env.CLAWDBOT_CONFIG_PATH?.trim();
  const stateDir = process.env.OPENCLAW_STATE_DIR?.trim() || path.join(os.homedir(), ".openclaw");
  const candidates = ["openclaw.json", "openclaw.json5", "config.json", "clawdbot.json"];
  let cfg: Record<string, unknown> = {};
  if (explicitPath && fs.existsSync(explicitPath)) {
    try { cfg = JSON.parse(fs.readFileSync(explicitPath, "utf8")) as Record<string, unknown>; } catch { return null; }
  } else {
    for (const name of candidates) {
      const p = path.join(stateDir, name);
      if (fs.existsSync(p)) {
        try { cfg = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>; break; } catch { return null; }
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
  const explicitPath = process.env.OPENCLAW_CONFIG_PATH?.trim() || process.env.CLAWDBOT_CONFIG_PATH?.trim();
  const stateDir = process.env.OPENCLAW_STATE_DIR?.trim() || path.join(os.homedir(), ".openclaw");
  const candidates = ["openclaw.json", "openclaw.json5", "config.json", "clawdbot.json"];
  let cfg: Record<string, unknown> = {};
  if (explicitPath && fs.existsSync(explicitPath)) {
    try { cfg = JSON.parse(fs.readFileSync(explicitPath, "utf8")) as Record<string, unknown>; } catch { return null; }
  } else {
    for (const name of candidates) {
      const p = path.join(stateDir, name);
      if (fs.existsSync(p)) {
        try { cfg = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>; break; } catch { return null; }
      }
    }
  }
  const gw = cfg.gateway as Record<string, unknown> | undefined;
  const port = gw?.port;
  if (typeof port === "number" && port > 0) {return port;}
  if (typeof port === "string" && Number(port) > 0) {return Number(port);}
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

async function waitForGatewayReady(port: number, timeoutMs: number): Promise<void> {
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
      console.log(`[gateway] 检测到端口 ${configPort} 已有 Gateway 运行，复用现有实例`);
      reusingExternalGateway = true;
      _activePort = configPort;
      return;
    }
    // 未运行，在配置端口启动（不带 --force，不干扰其他端口上的进程）
    console.log(`[gateway] 配置端口 ${configPort} 无运行实例，启动新 Gateway`);
    _activePort = configPort;
    await spawnGateway({ port: configPort, token: existingToken, force: false });
  } else {
    // 无配置 token，在默认端口 18789 启动（带 --force），使用调用方提供的随机 token
    const port = opts.port ?? DEFAULT_GATEWAY_PORT;
    gatewayToken = opts.token;
    _activePort = port;
    console.log(`[gateway] 无现有配置，在端口 ${port} 启动 Gateway`);
    await spawnGateway({ port, token: opts.token, force: true });
  }
}

async function spawnGateway(opts: { port: number; token: string; force: boolean }): Promise<void> {
  const nodeBin = resolveBundledNode();
  const openclawEntry = resolveOpenclaw();
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

  console.log(`[gateway] 启动: ${nodeBin} ${args.join(" ")}`);

  gatewayProcess = spawn(nodeBin, args, {
    env: {
      ...process.env,
      // Token 通过环境变量注入，不出现在进程参数里
      OPENCLAW_GATEWAY_TOKEN: opts.token,
      OPENCLAW_GATEWAY_PORT: String(opts.port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  gatewayProcess.stdout?.on("data", (data: Buffer) => {
    process.stdout.write(`[gateway] ${data}`);
  });

  gatewayProcess.stderr?.on("data", (data: Buffer) => {
    process.stderr.write(`[gateway] ${data}`);
  });

  gatewayProcess.on("exit", (code, signal) => {
    console.log(`[gateway] 进程退出 code=${code} signal=${signal}`);
    gatewayProcess = null;
  });

  gatewayProcess.on("error", (err) => {
    console.error(`[gateway] 启动失败:`, err.message);
  });

  await waitForGatewayReady(opts.port, GATEWAY_READY_TIMEOUT_MS);
  console.log(`[gateway] 就绪，端口 ${opts.port}`);
}

/**
 * 停止 Gateway 子进程。
 * 若复用的是外部已有 Gateway，则不执行任何操作。
 */
export function stopGateway(): void {
  if (reusingExternalGateway) {
    console.log("[gateway] 复用外部 Gateway，跳过停止操作");
    return;
  }
  if (!gatewayProcess) {return;}
  console.log("[gateway] 正在停止...");
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
  await startGateway(opts);
}

export function getGatewayToken(): string {
  return gatewayToken;
}

/** 返回当前实际使用的 Gateway 端口（复用外部时为配置端口，否则为启动时指定端口）。 */
export function getGatewayPort(): number {
  return _activePort;
}
