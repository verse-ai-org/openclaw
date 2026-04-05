#!/usr/bin/env bash
# 打包 Electron Windows 客户端（在 macOS 或 Linux 上交叉编译）
# 产物输出到 apps/electron/release/
#
# 用法示例：
#   bash scripts/package-electron-win.sh          # x64（默认）
#   ARCH=x64 bash scripts/package-electron-win.sh
#   LOCAL_FAST=1 bash scripts/package-electron-win.sh  # 跳过构建，快速验证打包流程
set -euo pipefail

ELECTRON_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT_DIR="$(cd "$ELECTRON_DIR/../.." && pwd)"
ARCH="${ARCH:-x64}"       # Windows 目前只发 x64；如需 arm64 可改此变量
LOCAL_FAST="${LOCAL_FAST:-0}"
SKIP_BUILD="${SKIP_BUILD:-0}"
REUSE_RUNTIME_DEPS="${REUSE_RUNTIME_DEPS:-0}"
PROD_DEPLOY_DIR="$ELECTRON_DIR/resources/prod-node_modules"
PACKAGED_RUNTIME_CONFIG="$ELECTRON_DIR/packaged-runtime.json"

if [ "$LOCAL_FAST" = "1" ]; then
  SKIP_BUILD=1
  REUSE_RUNTIME_DEPS=1
fi

BUILDER_ARGS=(--win --${ARCH})

load_env() {
  local env_file="$ELECTRON_DIR/.env"
  if [ -f "$env_file" ]; then
    echo "📄 加载环境变量: $env_file"
    # 读取 .env，跳过注释和空行，导出变量
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
}

print_banner() {
  echo "======================================"
  echo "  OpenClaw Electron Windows 打包"
  echo "  架构: $ARCH"
  if [ "$LOCAL_FAST" = "1" ]; then
    echo "  模式: 本地快速测试（跳过构建，复用产物）"
  fi
  echo "======================================"
}

build_artifacts_if_needed() {
  if [ "$SKIP_BUILD" = "1" ]; then
    echo ""
    echo "⏭️  [1-2/5] 跳过 CLI + Control UI 构建，复用现有产物"
  else
    echo ""
    echo "📦 [1/5] 构建 openclaw CLI (pnpm build)"
    (cd "$ROOT_DIR" && pnpm build)

    echo ""
    echo "🖥  [2/5] 构建 Control UI (pnpm ui:build)"
    (cd "$ROOT_DIR" && node scripts/ui.js build)
  fi

  # ui-react 必须始终构建：打包时 Resources/control-ui-react/ 必须存在，
  # 否则静态 server 找不到 setup.html / index.html，渲染进程会黑屏 + 404。
  echo ""
  echo "⚛️  [2b/5] 构建 React Control UI (ui-react)"
  (cd "$ROOT_DIR" && pnpm --filter openclaw-control-ui-react build)
}

download_runtime_node() {
  echo ""
  echo "⬇️  [3/5] 下载 Node 24 二进制 (win-${ARCH})"
  bash "$ELECTRON_DIR/scripts/download-node.sh" "$ARCH" "win"
}

generate_runtime_package_json() {
  node "$ELECTRON_DIR/scripts/generate-runtime-package.mjs" \
    "$PACKAGED_RUNTIME_CONFIG" \
    "$ROOT_DIR/package.json" \
    "$PROD_DEPLOY_DIR" \
    "$ROOT_DIR"
}

install_runtime_dependencies() {
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

  if [ "$REUSE_RUNTIME_DEPS" = "1" ] && [ -d "$PROD_DEPLOY_DIR/node_modules" ]; then
    echo "♻️  复用已有运行时 node_modules: $PROD_DEPLOY_DIR/node_modules"
    return
  fi

  rm -rf "$PROD_DEPLOY_DIR"
  mkdir -p "$PROD_DEPLOY_DIR"

  generate_runtime_package_json

  (cd "$PROD_DEPLOY_DIR" && pnpm install --prod --no-frozen-lockfile --ignore-workspace)
  bash "$ELECTRON_DIR/scripts/prune-electron-node-modules.sh" "$PROD_DEPLOY_DIR" "$ARCH" "win"
}

prune_runtime_dependencies() {
  echo ""
  echo "🧹 [3c/5] 裁剪运行时依赖（按当前架构：win-${ARCH}）"

  local koffi_target_platform
  case "$ARCH" in
    x64)
      koffi_target_platform="win32_x64"
      ;;
    arm64)
      koffi_target_platform="win32_arm64"
      ;;
    *)
      echo "⚠️  未知 ARCH=$ARCH，跳过 koffi 多平台裁剪"
      return
      ;;
  esac

  local koffi_dirs
  shopt -s nullglob
  koffi_dirs=("$PROD_DEPLOY_DIR"/node_modules/.pnpm/koffi@*/node_modules/koffi)
  shopt -u nullglob

  if [ ${#koffi_dirs[@]} -eq 0 ]; then
    echo "ℹ️  未找到 koffi 目录，跳过裁剪"
    return
  fi

  local koffi_dir
  for koffi_dir in "${koffi_dirs[@]}"; do
    local koffi_build_dir="$koffi_dir/build/koffi"
    if [ ! -d "$koffi_build_dir" ]; then
      continue
    fi

    local platform_dir
    for platform_dir in "$koffi_build_dir"/*; do
      if [ "$(basename "$platform_dir")" = "$koffi_target_platform" ]; then
        continue
      fi
      rm -rf "$platform_dir"
    done
  done

  echo "✅ koffi 已裁剪，仅保留: $koffi_target_platform"
}

build_electron_main() {
  echo ""
  echo "🔨 [4/5] 构建 Electron 主进程 (tsdown)"
  (cd "$ELECTRON_DIR" && pnpm build)
}

package_electron_app() {
  echo ""
  echo "📦 [5/5] 打包 Electron Windows App"
  (cd "$ELECTRON_DIR" && pnpm exec electron-builder "${BUILDER_ARGS[@]}")
}

cleanup_runtime_dependencies() {
  rm -rf "$PROD_DEPLOY_DIR"
}

print_runtime_dependencies_summary() {
  echo "📊 运行时 node_modules 大小: $(du -sh "$PROD_DEPLOY_DIR/node_modules" 2>/dev/null | cut -f1 || echo '?')"
  echo "✅ Electron 运行时 node_modules 准备完成"
}

print_completion() {
  echo ""
  echo "✅ 完成！产物位于: $ELECTRON_DIR/release/"
  ls -lh "$ELECTRON_DIR/release/" 2>/dev/null || true
}

main() {
  load_env
  print_banner
  build_artifacts_if_needed
  download_runtime_node
  install_runtime_dependencies
  prune_runtime_dependencies
  print_runtime_dependencies_summary
  build_electron_main
  package_electron_app
  cleanup_runtime_dependencies
  print_completion
}

main "$@"
