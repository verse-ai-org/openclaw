import { app } from "electron";
import {
  CHILD_STDERR_TAIL_LINES,
  GATEWAY_PROBE_PATH,
  GATEWAY_READY_POLL_MS,
  GATEWAY_READY_TIMEOUT_MS,
  GATEWAY_READY_TIMEOUT_MS_WIN,
} from "./constants.js";

export type GatewayChildWaitState = {
  stderrLines: string[];
  exit: { code: number | null; signal: NodeJS.Signals | null } | null;
  /** Set when the child logs a gateway listen-ready line (stdout or stderr). */
  sawListening: boolean;
};

function gatewayProbeUrl(port: number): string {
  return `http://127.0.0.1:${port}${GATEWAY_PROBE_PATH}`;
}

export async function probeGatewayHttpReady(
  port: number,
  timeoutMs: number,
): Promise<boolean> {
  try {
    const res = await fetch(gatewayProbeUrl(port), {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function resolveGatewayReadyTimeoutMs(): number {
  if (process.platform === "win32" && app.isPackaged) {
    return GATEWAY_READY_TIMEOUT_MS_WIN;
  }
  return GATEWAY_READY_TIMEOUT_MS;
}

/** Packaged Bossim owns the gateway port; dev mode may reuse a CLI gateway. */
export function canReuseExistingGateway(): boolean {
  return !app.isPackaged;
}

export function shouldForceGatewaySpawn(): boolean {
  return app.isPackaged || process.platform === "win32";
}

export async function isGatewayRunning(port: number): Promise<boolean> {
  return probeGatewayHttpReady(port, 1500);
}

export function appendChildStderr(state: GatewayChildWaitState, chunk: string): void {
  for (const line of chunk.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    state.stderrLines.push(trimmed);
    if (state.stderrLines.length > CHILD_STDERR_TAIL_LINES) {
      state.stderrLines.shift();
    }
  }
}

function formatStderrTail(state: GatewayChildWaitState | undefined): string {
  if (!state || state.stderrLines.length === 0) {
    return "";
  }
  return `\n--- gateway stderr (tail) ---\n${state.stderrLines.join("\n")}`;
}

export function formatGatewayChildExitError(
  port: number,
  state: GatewayChildWaitState,
): Error {
  const { code, signal } = state.exit!;
  return new Error(
    `Gateway 子进程已退出 (code=${code ?? "null"} signal=${signal ?? "null"})，端口 ${port} 未就绪${formatStderrTail(state)}`,
  );
}

export async function waitForGatewayReady(
  port: number,
  timeoutMs: number,
  childState?: GatewayChildWaitState,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (childState?.exit) {
      throw formatGatewayChildExitError(port, childState);
    }
    if (await probeGatewayHttpReady(port, 1000)) {
      if (!childState || childState.sawListening) {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, GATEWAY_READY_POLL_MS));
  }
  if (childState?.exit) {
    throw formatGatewayChildExitError(port, childState);
  }
  throw new Error(
    `Gateway 未能在 ${timeoutMs}ms 内在端口 ${port} 上就绪${formatStderrTail(childState)}`,
  );
}
