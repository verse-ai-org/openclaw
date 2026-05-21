import { execFileSync } from "node:child_process";
import { mainLogInfo } from "../logger.js";
import {
  PRE_FREE_POLL_MS,
  PRE_FREE_RELEASE_TIMEOUT_MS,
  PRE_FREE_SIGTERM_WAIT_MS,
} from "./constants.js";
import { logEvent } from "./logging.js";
import { probeGatewayHttpReady } from "./probe.js";

/** PIDs listening on TCP port (loopback). */
function listListenersOnPort(port: number): number[] {
  if (process.platform === "win32") {
    try {
      const out = execFileSync("netstat", ["-ano", "-p", "TCP"], {
        encoding: "utf8",
        windowsHide: true,
      });
      const pids = new Set<number>();
      for (const line of out.split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[3] === "LISTENING") {
          const addressPort = parts[1].split(":").pop();
          if (addressPort === String(port)) {
            const pid = Number.parseInt(parts[4] ?? "", 10);
            if (Number.isFinite(pid) && pid > 0) {
              pids.add(pid);
            }
          }
        }
      }
      return [...pids];
    } catch {
      return [];
    }
  }
  try {
    const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-FpFc"], {
      encoding: "utf8",
    });
    const pids = new Set<number>();
    for (const line of out.split(/\r?\n/)) {
      if (line.startsWith("p")) {
        const pid = Number.parseInt(line.slice(1), 10);
        if (Number.isFinite(pid) && pid > 0) {
          pids.add(pid);
        }
      }
    }
    return [...pids];
  } catch {
    return [];
  }
}

function killListenersOnPort(pids: number[], signal: NodeJS.Signals): void {
  for (const pid of pids) {
    if (pid === process.pid) {
      continue;
    }
    try {
      process.kill(pid, signal);
    } catch {
      // ESRCH — already gone
    }
  }
}

async function waitForGatewayPortReleased(
  port: number,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await probeGatewayHttpReady(port, 400))) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, PRE_FREE_POLL_MS));
  }
  return !(await probeGatewayHttpReady(port, 400));
}

/**
 * Clear stale gateway listeners before spawn so /health cannot succeed on a
 * dying process while the new child is still running --force internally.
 */
export async function preFreeGatewayPort(port: number): Promise<void> {
  const initialPids = listListenersOnPort(port);
  const initiallyHealthy = await probeGatewayHttpReady(port, 500);
  if (initialPids.length === 0 && !initiallyHealthy) {
    mainLogInfo(`[gateway] pre-free-port already-free port=${port}`);
    return;
  }

  logEvent(
    "pre-free-port",
    { status: "begin", port, pids: initialPids.join(",") || "(health-only)" },
    "note",
  );

  killListenersOnPort(initialPids, "SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, PRE_FREE_SIGTERM_WAIT_MS));

  const remaining = listListenersOnPort(port);
  if (remaining.length > 0) {
    killListenersOnPort(remaining, "SIGKILL");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const released = await waitForGatewayPortReleased(port, PRE_FREE_RELEASE_TIMEOUT_MS);
  logEvent(
    "pre-free-port",
    {
      status: released ? "done" : "health-still-up",
      port,
      remainingPids: listListenersOnPort(port).join(",") || "none",
    },
    released ? "info" : "warn",
  );
}
