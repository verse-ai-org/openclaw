import { defineConfig } from "tsup";

export default defineConfig([
  // 主进程
  {
    entry: { "main/index": "src/main/index.ts" },
    outDir: "dist",
    format: ["cjs"],
    target: "node20",
    platform: "node",
    external: ["electron"],
    sourcemap: true,
    clean: true,
    bundle: true,
    noExternal: [],
  },
  // preload 脚本
  {
    entry: { "preload/index": "src/preload/index.ts" },
    outDir: "dist",
    format: ["cjs"],
    target: "node20",
    platform: "node",
    external: ["electron"],
    sourcemap: true,
    bundle: true,
  },
]);
