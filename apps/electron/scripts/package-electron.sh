#!/usr/bin/env bash
# 打包 Electron macOS 客户端
# 产物输出到 apps/electron/release/
set -euo pipefail

ELECTRON_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT_DIR="$(cd "$ELECTRON_DIR/../.." && pwd)"
ARCH="${ARCH:-$(uname -m | sed 's/x86_64/x64/')}"
LOCAL_FAST="${LOCAL_FAST:-0}"
SKIP_BUILD="${SKIP_BUILD:-0}"
REUSE_RUNTIME_DEPS="${REUSE_RUNTIME_DEPS:-0}"

if [ "$LOCAL_FAST" = "1" ]; then
  SKIP_BUILD=1
  REUSE_RUNTIME_DEPS=1
fi

BUILDER_ARGS=(--mac --${ARCH})
if [ "$LOCAL_FAST" = "1" ]; then
  BUILDER_ARGS+=(--config.mac.identity=null --config.mac.hardenedRuntime=false)
fi

echo "======================================"
echo "  OpenClaw Electron macOS 打包"
echo "  架构: $ARCH"
if [ "$LOCAL_FAST" = "1" ]; then
  echo "  模式: 本地快速测试（无签名，可安装 DMG）"
fi
echo "======================================"

if [ "$SKIP_BUILD" != "1" ]; then
  echo ""
  echo "📦 [1/5] 构建 openclaw CLI (pnpm build)"
  (cd "$ROOT_DIR" && pnpm build)

  echo ""
  echo "🖥  [2/5] 构建 Control UI (pnpm ui:build)"
  (cd "$ROOT_DIR" && node scripts/ui.js build)

  echo ""
  echo "⚛️  [2b/5] 构建 React Control UI (ui-react)"
  (cd "$ROOT_DIR" && pnpm --filter openclaw-control-ui-react build)
else
  echo ""
  echo "⏭️  [1-2b/5] 跳过构建，复用现有产物"
fi

echo ""
echo "⬇️  [3/5] 下载 Node 22 二进制 ($ARCH)"
bash "$ELECTRON_DIR/scripts/download-node.sh" "$ARCH"

# 准备运行时 node_modules（覆盖 openclaw core CLI/gateway + Electron 额外交付能力）
# 说明：不再对整个 openclaw workspace 做 pnpm deploy，避免把未预装扩展
# （例如 extensions/tlon）的 git 依赖也卷入 Electron 安装包。
# 这里不再只安装少量原生包，而是由 apps/electron/packaged-runtime.json
# 显式声明 Electron 随包交付的运行时依赖：
# - coreRuntimeDependencies: 内嵌 openclaw CLI/gateway 的最小核心依赖
# - runtimeDependencies: 额外需要真实安装、不能只靠 bundle 的依赖
# 以保证桌面包内嵌的 openclaw CLI/gateway 能独立启动，同时避免回退到 root runtime 全量兜底。
echo ""
echo "📦 [3b/5] 安装 Electron 最小运行时依赖"
PROD_DEPLOY_DIR="$ELECTRON_DIR/resources/prod-node_modules"

if [ "$REUSE_RUNTIME_DEPS" = "1" ] && [ -d "$PROD_DEPLOY_DIR/node_modules" ]; then
  echo "♻️  复用已有运行时 node_modules: $PROD_DEPLOY_DIR/node_modules"
else
  rm -rf "$PROD_DEPLOY_DIR"
  mkdir -p "$PROD_DEPLOY_DIR"

  # Electron 打包运行时配置（单一事实来源）
  PACKAGED_RUNTIME_CONFIG="$ELECTRON_DIR/packaged-runtime.json"

  # Electron 桌面包运行时依赖：
  # 1. apps/electron/packaged-runtime.json 中的 coreRuntimeDependencies（内嵌 openclaw CLI/gateway 最小核心依赖）
  # 2. apps/electron/packaged-runtime.json 中的 runtimeDependencies（额外需要真实安装、但不属于 core 的依赖）
  # neverBundleDependencies 只负责约束 bundler，不等于都需要单独安装。
  RUNTIME_EXTERNALS_CSV="$(node --input-type=module -e 'import fs from "node:fs"; const cfg = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); const names = new Set([ ...(cfg.coreRuntimeDependencies ?? []), ...(cfg.runtimeDependencies ?? []), ]); process.stdout.write([...names].join(","));' "$PACKAGED_RUNTIME_CONFIG")"

  node --input-type=module -e '
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const rootPackagePath = process.argv[1];
const outputDir = process.argv[2];
const names = process.argv[3].split(",").filter(Boolean);
const rootDir = process.argv[4];
const rootPkg = JSON.parse(fs.readFileSync(rootPackagePath, "utf8"));
const requireFromRoot = createRequire(path.join(rootDir, "package.json"));
const manifestVersionMap = {
  ...(rootPkg.dependencies ?? {}),
  ...(rootPkg.peerDependencies ?? {}),
  ...(rootPkg.devDependencies ?? {}),
};

function resolveInstalledVersion(name) {
  try {
    const manifestPath = requireFromRoot.resolve(`${name}/package.json`);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return manifest.version ? `${manifest.version}` : null;
  } catch {
    return null;
  }
}

function resolveVersionFromLockfile(name) {
  try {
    const yaml = requireFromRoot("yaml");
    const lockfilePath = path.join(rootDir, "pnpm-lock.yaml");
    const lockfile = yaml.parse(fs.readFileSync(lockfilePath, "utf8"));
    const importers = lockfile?.importers ?? {};
    for (const importer of Object.values(importers)) {
      const sections = [
        importer?.dependencies ?? {},
        importer?.optionalDependencies ?? {},
        importer?.devDependencies ?? {},
      ];
      for (const section of sections) {
        const entry = section?.[name];
        const version = entry?.version ?? entry?.specifier;
        if (typeof version === "string" && version.length > 0) {
          const match = version.match(/^([^()]+)/);
          return match?.[1] ?? version;
        }
      }
    }
    const packages = lockfile?.packages ?? {};
    for (const key of Object.keys(packages)) {
      if (key === name) {
        const pkg = packages[key];
        if (pkg?.version) {
          return `${pkg.version}`;
        }
      }
      if (key.startsWith(`${name}@`)) {
        const suffix = key.slice(name.length + 1);
        const match = suffix.match(/^([^()]+)/);
        if (match?.[1]) {
          return match[1];
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

const resolvedEntries = names.map((name) => {
  const spec =
    manifestVersionMap[name] ??
    resolveInstalledVersion(name) ??
    resolveVersionFromLockfile(name);
  return [name, spec];
});

const missing = resolvedEntries.filter(([, spec]) => !spec).map(([name]) => name);
if (missing.length > 0) {
  console.error(`Missing runtime dependency versions from package.json, installed node_modules, and pnpm-lock.yaml: ${missing.join(", ")}`);
  process.exit(1);
}
const pkg = {
  name: "openclaw-electron-runtime",
  private: true,
  type: "module",
  dependencies: Object.fromEntries(resolvedEntries),
};
fs.writeFileSync(`${outputDir}/package.json`, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
' "$ROOT_DIR/package.json" "$PROD_DEPLOY_DIR" "$RUNTIME_EXTERNALS_CSV" "$ROOT_DIR"

  (cd "$PROD_DEPLOY_DIR" && pnpm install --prod --no-frozen-lockfile --ignore-workspace)
fi

echo "📊 运行时 node_modules 大小: $(du -sh "$PROD_DEPLOY_DIR/node_modules" 2>/dev/null | cut -f1 || echo '?')"
echo "✅ Electron 运行时 node_modules 准备完成"

echo ""
echo "🔨 [4/5] 构建 Electron 主进程 (tsdown)"
(cd "$ELECTRON_DIR" && pnpm build)

echo ""
echo "📦 [5/5] 打包 Electron App"
(cd "$ELECTRON_DIR" && pnpm exec electron-builder "${BUILDER_ARGS[@]}")

# 清理临时 node_modules
rm -rf "$PROD_DEPLOY_DIR"

echo ""
echo "✅ 完成！产物位于: $ELECTRON_DIR/release/"
ls -lh "$ELECTRON_DIR/release/" 2>/dev/null || true
