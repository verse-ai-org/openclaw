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
 * Gateway 绑定 loopback，origin-check 对本地连接自动放行，无需临时配置文件。
 */
export async function startGateway(opts: GatewayStartOptions): Promise<void> {
  const port = opts.port ?? DEFAULT_GATEWAY_PORT;
  gatewayToken = opts.token;

  const nodeBin = resolveBundledNode();
  const openclawEntry = resolveOpenclaw();

  console.log(`[gateway] 启动: ${nodeBin} ${openclawEntry} gateway run --port ${port}`);

  gatewayProcess = spawn(
    nodeBin,
    [
      openclawEntry,
      "gateway",
      "run",
      "--port",
      String(port),
      "--allow-unconfigured",
      // --force: 自动 kill 占用同端口的已有进程（包括用户本地手动启动的 gateway）
      "--force",
    ],
    {
      env: {
        ...process.env,
        // Token 通过环境变量注入，不出现在进程参数里
        OPENCLAW_GATEWAY_TOKEN: opts.token,
        OPENCLAW_GATEWAY_PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

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

  await waitForGatewayReady(port, GATEWAY_READY_TIMEOUT_MS);
  console.log(`[gateway] 就绪，端口 ${port}`);
}

/**
 * 停止 Gateway 子进程。
 */
export function stopGateway(): void {
  if (!gatewayProcess) return;
  console.log("[gateway] 正在停止...");
  gatewayProcess.kill("SIGTERM");
  gatewayProcess = null;
}

/**
 * 重启 Gateway（配置更新后调用）。
 */
export async function restartGateway(opts: GatewayStartOptions): Promise<void> {
  stopGateway();
  // 等待端口释放
  await new Promise((resolve) => setTimeout(resolve, 800));
  await startGateway(opts);
}

export function getGatewayToken(): string {
  return gatewayToken;
}
