import { spawn } from "node:child_process";
import os from "node:os";
import { mainLogError, mainLogInfo } from "../logger.js";

let loginShellEnv: Record<string, string> | null = null;

/**
 * Reads environment variables from the user's login shell (bash -l).
 * Falls back to an empty object on failure — callers spread process.env as baseline.
 */
async function resolveLoginShellEnv(): Promise<Record<string, string>> {
  if (loginShellEnv !== null) {
    return loginShellEnv;
  }
  if (process.platform === "win32") {
    loginShellEnv = {};
    return loginShellEnv;
  }
  return new Promise((resolve) => {
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
          result[line.slice(0, eq)] = line.slice(eq + 1);
        }
      }
      loginShellEnv = result;
      mainLogInfo(
        `[gateway] resolveLoginShellEnv: loaded ${Object.keys(result).length} vars from login shell`,
      );
      resolve(result);
    });
    child.on("error", (err) => {
      mainLogError("[gateway] resolveLoginShellEnv failed:", err);
      loginShellEnv = {};
      resolve({});
    });
  });
}

/** Cached login-shell env for spawn; empty object until warmLoginShellEnv runs. */
export function getLoginShellEnvSnapshot(): Record<string, string> {
  return loginShellEnv ?? {};
}

/** Pre-warms the login shell env cache at app startup. */
export async function warmLoginShellEnv(): Promise<void> {
  await resolveLoginShellEnv();
}
