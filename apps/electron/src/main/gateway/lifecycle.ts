import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { app } from "electron";
import { mainLogInfo, mainLogNote } from "../logger.js";
import { auditBundledExtensions, auditConfigPlugins } from "./audit.js";
import { DEFAULT_GATEWAY_PORT } from "./constants.js";
import {
  loadUserOpenClawConfig,
  readExistingGatewayPort,
  readExistingGatewayToken,
} from "./config.js";
import { logEvent } from "./logging.js";
import {
  canReuseExistingGateway,
  isGatewayRunning,
  probeGatewayHttpReady,
  shouldForceGatewaySpawn,
} from "./probe.js";
import { killGatewayChildProcess, spawnGateway } from "./spawn.js";
import {
  clearReusingExternalGateway,
  gatewayRuntime,
  isReusingExternalGateway,
  markReusingExternalGateway,
  resetGatewaySessionForStart,
} from "./state.js";

export interface GatewayStartOptions {
  port?: number;
  token: string;
  /** Splash / startup UI: sub-status while phase stays `gateway`. */
  onProgress?: (message: string) => void;
}

/**
 * 启动 openclaw gateway 子进程，等待就绪后返回。
 */
export async function startGateway(opts: GatewayStartOptions): Promise<void> {
  mainLogInfo("[gateway] starting");
  resetGatewaySessionForStart();
  const report = opts.onProgress;

  report?.("Preparing to start application...");

  auditBundledExtensions();

  const existingToken = readExistingGatewayToken();
  const configPort = readExistingGatewayPort() ?? DEFAULT_GATEWAY_PORT;

  const cfg = loadUserOpenClawConfig();
  if (cfg) {
    auditConfigPlugins(cfg);
  } else {
    const cfgPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
    if (fs.existsSync(cfgPath)) {
      logEvent(
        "audit-config-plugins",
        { status: "parse-error", path: cfgPath },
        "warn",
      );
    }
  }

  if (existingToken) {
    gatewayRuntime.gatewayToken = existingToken;
    if (canReuseExistingGateway()) {
      const running = await isGatewayRunning(configPort);
      if (running) {
        logEvent("reuse-gateway", { port: configPort }, "note");
        report?.("Connecting to existing service…");
        markReusingExternalGateway(configPort);
        return;
      }
    } else if (await isGatewayRunning(configPort)) {
      logEvent(
        "replace-stale-gateway",
        { port: configPort, reason: "packaged-app-owns-lifecycle" },
        "note",
      );
    }
    const force = shouldForceGatewaySpawn();
    logEvent(
      "spawn-gateway",
      {
        port: configPort,
        force,
        reason: canReuseExistingGateway()
          ? "config-port-no-instance"
          : "packaged-managed",
      },
      "note",
    );
    gatewayRuntime.activePort = configPort;
    await spawnGateway({
      port: configPort,
      token: existingToken,
      force,
      onProgress: report,
    });
  } else {
    const port = opts.port ?? DEFAULT_GATEWAY_PORT;
    gatewayRuntime.gatewayToken = opts.token;
    gatewayRuntime.activePort = port;
    const force = shouldForceGatewaySpawn();
    logEvent("spawn-gateway", { port, force, reason: "no-config-token" }, "note");
    await spawnGateway({ port, token: opts.token, force, onProgress: report });
  }

  logEvent("start-gateway", { phase: "complete", port: gatewayRuntime.activePort }, "note");
}

/** HTTP /health probe for activate / skip-splash heuristics. */
export async function isGatewayHealthy(port?: number): Promise<boolean> {
  const p = port ?? gatewayRuntime.activePort;
  return probeGatewayHttpReady(p, 1500);
}

/**
 * 停止 Gateway 子进程。
 * 若复用的是外部已有 Gateway，则不执行任何操作。
 */
export function stopGateway(): void {
  if (isReusingExternalGateway() && !app.isPackaged) {
    logEvent("stop", { status: "skipped", reason: "reusing-external" });
    return;
  }
  clearReusingExternalGateway();
  if (!gatewayRuntime.gatewayProcess) {
    logEvent("stop", { status: "skipped", reason: "no-process" });
    return;
  }
  mainLogNote(`[gateway] stopping pid=${gatewayRuntime.gatewayProcess.pid ?? "?"}`);
  gatewayRuntime.intentionalStop = true;
  const proc = gatewayRuntime.gatewayProcess;
  gatewayRuntime.gatewayProcess = null;
  killGatewayChildProcess(proc);
}

/**
 * 为应用更新停止 Gateway 并等待子进程退出，避免 Windows NSIS 因文件锁导致安装失败。
 */
export async function stopGatewayForUpdate(): Promise<void> {
  if (isReusingExternalGateway() && !app.isPackaged) {
    return;
  }
  clearReusingExternalGateway();
  const proc = gatewayRuntime.gatewayProcess;
  if (!proc) {
    return;
  }
  mainLogNote(`[gateway] stopping for app update pid=${proc.pid ?? "?"}`);
  gatewayRuntime.intentionalStop = true;
  gatewayRuntime.gatewayProcess = null;

  const settleMs = process.platform === "win32" ? 2000 : 1000;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, settleMs);
    proc.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    killGatewayChildProcess(proc);
  });

  if (process.platform === "win32") {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/**
 * 重启 Gateway（配置更新后调用）。
 * 若当前为复用外部 Gateway，则仍复用（不重启）。
 */
export async function restartGateway(opts: GatewayStartOptions): Promise<void> {
  mainLogNote(`[gateway] restart begin port=${gatewayRuntime.activePort}`);
  if (isReusingExternalGateway() && !app.isPackaged) {
    logEvent("restart", { status: "skipped", reason: "reusing-external" });
    return;
  }
  clearReusingExternalGateway();
  stopGateway();
  await new Promise((resolve) => setTimeout(resolve, 800));

  const port = gatewayRuntime.activePort;
  const token = opts.token || gatewayRuntime.gatewayToken;
  gatewayRuntime.gatewayToken = token;
  await spawnGateway({ port, token, force: true });
  logEvent("restart", { phase: "complete", port }, "note");
}

export function getGatewayToken(): string {
  if (isReusingExternalGateway()) {
    const fresh = readExistingGatewayToken();
    if (fresh && fresh !== gatewayRuntime.gatewayToken) {
      mainLogNote("[gateway] token rotated, updating cached value");
      gatewayRuntime.gatewayToken = fresh;
    }
  }
  return gatewayRuntime.gatewayToken;
}

/** 返回当前实际使用的 Gateway 端口。 */
export function getGatewayPort(): number {
  return gatewayRuntime.activePort;
}
