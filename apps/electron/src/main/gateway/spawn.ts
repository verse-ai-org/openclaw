import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { app } from "electron";
import { noteChildGatewayReadySignal } from "./ready-signal.js";
import { mainLogInfo } from "../logger.js";
import { logEvent, writeChildStream } from "./logging.js";
import { preFreeGatewayPort } from "./port.js";
import {
  appendChildStderr,
  resolveGatewayReadyTimeoutMs,
  waitForGatewayReady,
  type GatewayChildWaitState,
} from "./probe.js";
import {
  resolveBundledNode,
  resolveGatewayPath,
  resolveOpenclaw,
} from "./paths.js";
import { getLoginShellEnvSnapshot } from "./shell-env.js";
import { gatewayRuntime, isReusingExternalGateway, notifyGatewayCrash } from "./state.js";

export type SpawnGatewayOptions = {
  port: number;
  token: string;
  force: boolean;
  onProgress?: (message: string) => void;
};

export function killGatewayChildProcess(proc: ChildProcess): void {
  const pid = proc.pid;
  if (pid == null) {
    try {
      proc.kill("SIGTERM");
    } catch {
      // ignore
    }
    return;
  }
  if (process.platform === "win32") {
    const res = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      encoding: "utf8",
      stdio: "ignore",
      windowsHide: true,
    });
    if (res.status !== 0) {
      try {
        proc.kill();
      } catch {
        // ignore
      }
    }
    return;
  }
  try {
    proc.kill("SIGTERM");
  } catch {
    // ignore
  }
}

export async function spawnGateway(opts: SpawnGatewayOptions): Promise<void> {
  const nodeBin = resolveBundledNode();
  const openclawEntry = resolveOpenclaw();

  if (app.isPackaged) {
    const entryExists = fs.existsSync(openclawEntry);
    logEvent("path-check", { entry: entryExists ? "✓" : "✗" });
    if (!entryExists) {
      logEvent("path-check-failed", { entry: openclawEntry }, "warn");
      throw new Error(`打包资源缺失: entry=${openclawEntry}`);
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
    opts.onProgress?.("Preparing Service...");
    await preFreeGatewayPort(opts.port);
    args.push("--force");
  }

  mainLogInfo(
    `[gateway] spawn port=${opts.port} force=${opts.force} entry=${openclawEntry}`,
  );

  const shellEnv = getLoginShellEnvSnapshot();
  const mergedPath = resolveGatewayPath(shellEnv);

  const childWaitState: GatewayChildWaitState = {
    stderrLines: [],
    exit: null,
    sawListening: false,
  };

  gatewayRuntime.gatewayProcess = spawn(nodeBin, args, {
    cwd: path.dirname(openclawEntry),
    env: {
      HOME: os.homedir(),
      ...shellEnv,
      ...process.env,
      PATH: mergedPath,
      ...(app.isPackaged ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
      OPENCLAW_GATEWAY_TOKEN: opts.token,
      OPENCLAW_GATEWAY_PORT: String(opts.port),
      OPENCLAW_NO_RESPAWN: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const proc = gatewayRuntime.gatewayProcess;
  logEvent("spawned", { pid: proc?.pid ?? null, port: opts.port }, "note");
  opts.onProgress?.("Starting Service...");

  proc.stdout?.on("data", (data: Buffer) => {
    const text = data.toString();
    noteChildGatewayReadySignal(childWaitState, text);
    writeChildStream("stdout", text);
  });

  proc.stderr?.on("data", (data: Buffer) => {
    const text = data.toString();
    noteChildGatewayReadySignal(childWaitState, text);
    appendChildStderr(childWaitState, text);
    writeChildStream("stderr", text);
  });

  proc.on("exit", (code, signal) => {
    childWaitState.exit = { code, signal };
    logEvent(
      "exit",
      { code, signal, pid: gatewayRuntime.gatewayProcess?.pid ?? null },
      code === 0 && (signal === null || signal === "SIGTERM") ? "info" : "warn",
    );
    gatewayRuntime.gatewayProcess = null;
    if (!gatewayRuntime.intentionalStop && !isReusingExternalGateway()) {
      logEvent(
        "unexpected-exit",
        {
          code,
          signal,
          isCrash: code !== 0 || (signal !== null && signal !== "SIGTERM"),
        },
        "warn",
      );
      notifyGatewayCrash(code, signal);
    }
    gatewayRuntime.intentionalStop = false;
  });

  proc.on("error", (err) => {
    logEvent("spawn-error", { error: err.message }, "warn");
  });

  const readyTimeoutMs = resolveGatewayReadyTimeoutMs();
  opts.onProgress?.("Ready to start application...");
  await waitForGatewayReady(opts.port, readyTimeoutMs, childWaitState);
  opts.onProgress?.("Application starting...");
  logEvent("ready", { port: opts.port }, "note");
}
