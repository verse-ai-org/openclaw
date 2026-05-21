import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import { mainLogInfo, mainLogWarn } from "../logger.js";

/** Repo root when main bundle lives at dist/main/index.cjs (four levels up). */
export function resolveRepoRootFromGatewayModule(): string {
  return path.resolve(__dirname, "../../../../");
}

export function resolveBundledExtensionsDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "openclaw", "extensions");
  }
  return path.join(resolveRepoRootFromGatewayModule(), "extensions");
}

/**
 * 解析 Node 运行时路径。
 * Electron 42+ 内嵌 Node 24.15.0，打包后直接使用 Electron 自身的 Node 运行时，
 * 无需额外捆绑独立 Node 二进制（省 ~114 MB）。
 *
 * macOS: 使用 Helper 二进制而非主 app 二进制，避免子进程在 Dock 中显示图标。
 */
export function resolveBundledNode(): string {
  if (app.isPackaged) {
    if (process.platform === "darwin") {
      const appName = path.basename(process.execPath);
      const contentsDir = path.join(path.dirname(process.execPath), "..");
      const helperBin = path.join(
        contentsDir,
        "Frameworks",
        `${appName} Helper.app`,
        "Contents",
        "MacOS",
        `${appName} Helper`,
      );
      if (fs.existsSync(helperBin)) {
        mainLogInfo(`[gateway] resolveBundledNode (packaged/macOS): using Helper ${helperBin}`);
        return helperBin;
      }
      mainLogWarn(`[gateway] Helper binary not found at ${helperBin}, falling back to execPath`);
    }
    const p = process.execPath;
    mainLogInfo(`[gateway] resolveBundledNode (packaged): using electron execPath ${p}`);
    return p;
  }
  const devPath = process.execPath.includes("electron") ? "node" : process.execPath;
  mainLogInfo(`[gateway] resolveBundledNode (dev): ${devPath}`);
  return devPath;
}

/**
 * 解析 openclaw CLI 入口文件路径。
 * - 打包后：Resources/openclaw/openclaw.mjs
 * - 开发时：repo root 的 openclaw.mjs
 */
export function resolveOpenclaw(): string {
  if (app.isPackaged) {
    const p = path.join(process.resourcesPath, "openclaw", "openclaw.mjs");
    const exists = fs.existsSync(p);
    mainLogInfo(`[gateway] resolveOpenclaw (packaged): ${p} exists=${exists}`);
    if (!exists) {
      mainLogWarn(`[gateway] openclaw entry missing: ${p}`);
    }
    return p;
  }
  const devPath = path.join(resolveRepoRootFromGatewayModule(), "openclaw.mjs");
  const exists = fs.existsSync(devPath);
  mainLogInfo(`[gateway] resolveOpenclaw (dev): ${devPath} exists=${exists}`);
  if (!exists) {
    mainLogWarn(`[gateway] openclaw entry missing: ${devPath}`);
  }
  return devPath;
}

/**
 * Build the PATH for the Gateway subprocess.
 */
export function resolveGatewayPath(shellEnv: Record<string, string | undefined>): string {
  const basePath = shellEnv.PATH ?? process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin";
  if (!app.isPackaged) {
    return basePath;
  }
  const packagedNodeDir = path.join(process.resourcesPath, "node");
  return `${basePath}${path.delimiter}${packagedNodeDir}`;
}
