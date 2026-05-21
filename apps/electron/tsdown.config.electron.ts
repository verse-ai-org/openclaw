import { defineConfig } from "tsdown";
import packagedRuntime from "./packaged-runtime.json";

/**
 * Electron 主进程专用 tsdown bundle 配置。
 *
 * 策略：将大部分纯 JS 依赖内联到 bundle，只保留以下情况为 neverBundle：
 *  1. electron 本身
 *  2. 含 .node 原生绑定的包（sharp、playwright-core、sqlite-vec 等）
 *  3. jiti / 动态加载入口（插件运行时）
 *  4. 体积极大或自带 binary 下载逻辑的包（esbuild）
 */

// 必须保持 neverBundle（不能内联）的原生/特殊模块
export const NATIVE_EXTERNALS = packagedRuntime.neverBundleDependencies;

// Electron 壳依赖：beforeBuild 跳过 app node_modules 收集，必须打进 main/preload bundle
const ELECTRON_SHELL_ALWAYS_BUNDLE = ["electron-updater"] as const;

export default defineConfig([
  // ─── Electron 主进程 ────────────────────────────────────────────────────────
  {
    entry: { "main/index": "src/main/index.ts" },
    outDir: "dist",
    format: ["cjs"],
    platform: "node",
    target: "node24",
    deps: {
      // 不内联这些原生/特殊模块，运行时从 node_modules 加载
      neverBundle: NATIVE_EXTERNALS as unknown as string[],
      alwaysBundle: [...ELECTRON_SHELL_ALWAYS_BUNDLE],
    },
    sourcemap: true,
    clean: true,
    env: {
      NODE_ENV: "production",
    },
  },

  // ─── preload 脚本 ────────────────────────────────────────────────────────────
  {
    entry: { "preload/index": "src/preload/index.ts" },
    outDir: "dist",
    format: ["cjs"],
    platform: "node",
    target: "node24",
    deps: {
      neverBundle: NATIVE_EXTERNALS as unknown as string[],
      alwaysBundle: [...ELECTRON_SHELL_ALWAYS_BUNDLE],
    },
    sourcemap: true,
    env: {
      NODE_ENV: "production",
    },
  },
]);
