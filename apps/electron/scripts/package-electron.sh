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
PROD_DEPLOY_DIR="$ELECTRON_DIR/resources/prod-node_modules"
PACKAGED_RUNTIME_CONFIG="$ELECTRON_DIR/packaged-runtime.json"

if [ "$LOCAL_FAST" = "1" ]; then
  SKIP_BUILD=1
  REUSE_RUNTIME_DEPS=1
fi

BUILDER_ARGS=(--mac --${ARCH} --publish never)
if [ "$LOCAL_FAST" = "1" ]; then
  BUILDER_ARGS+=(--config.mac.identity=null --config.mac.hardenedRuntime=false)
fi

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

  # 若设置了 KEY_PATH，读取文件内容到 APP_STORE_CONNECT_API_KEY_P8
  if [ -n "${APP_STORE_CONNECT_API_KEY_PATH:-}" ] && [ -z "${APP_STORE_CONNECT_API_KEY_P8:-}" ]; then
    if [ -f "$APP_STORE_CONNECT_API_KEY_PATH" ]; then
      APP_STORE_CONNECT_API_KEY_P8="$(cat "$APP_STORE_CONNECT_API_KEY_PATH")"
      export APP_STORE_CONNECT_API_KEY_P8
      echo "🔑 已从文件加载 API Key: $APP_STORE_CONNECT_API_KEY_PATH"
    else
      echo "⚠️  APP_STORE_CONNECT_API_KEY_PATH 指定的文件不存在: $APP_STORE_CONNECT_API_KEY_PATH"
    fi
  fi

  # electron-builder 26.8.1 内置公证使用不同的变量名，映射过去
  # APPLE_API_KEY = p8 文件路径, APPLE_API_KEY_ID = Key ID, APPLE_API_ISSUER = Issuer ID
  if [ -n "${APP_STORE_CONNECT_API_KEY_PATH:-}" ]; then
    # 本地：直接用文件路径
    export APPLE_API_KEY="$APP_STORE_CONNECT_API_KEY_PATH"
  elif [ -n "${APP_STORE_CONNECT_API_KEY_P8:-}" ]; then
    # CI：p8 内容写入临时文件，再指向该路径
    _TMP_P8="$(mktemp /tmp/AuthKey_XXXXXX.p8)"
    printf '%s' "$APP_STORE_CONNECT_API_KEY_P8" > "$_TMP_P8"
    chmod 600 "$_TMP_P8"
    export APPLE_API_KEY="$_TMP_P8"
    echo "🔑 CI：已将 p8 内容写入临时文件: $_TMP_P8"
  fi
  if [ -n "${APP_STORE_CONNECT_KEY_ID:-}" ]; then
    export APPLE_API_KEY_ID="$APP_STORE_CONNECT_KEY_ID"
  fi
  if [ -n "${APP_STORE_CONNECT_ISSUER_ID:-}" ]; then
    export APPLE_API_ISSUER="$APP_STORE_CONNECT_ISSUER_ID"
  fi
}

print_banner() {
  echo "======================================"
  echo "  OpenClaw Electron macOS 打包"
  echo "  架构: $ARCH"
  if [ "$LOCAL_FAST" = "1" ]; then
    echo "  模式: 本地快速测试（无签名，可安装 DMG）"
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
  echo "⬇️  [3/5] 下载 Node 24 二进制 ($ARCH)"
  bash "$ELECTRON_DIR/scripts/download-node.sh" "$ARCH"
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
  cp "$ELECTRON_DIR/scripts/electron-prod.npmrc" "$PROD_DEPLOY_DIR/.npmrc"

  (cd "$PROD_DEPLOY_DIR" && pnpm install --prod --no-frozen-lockfile --ignore-workspace)
  bash "$ELECTRON_DIR/scripts/prune-electron-node-modules.sh" "$PROD_DEPLOY_DIR" "$ARCH" "darwin"
}



prune_runtime_dependencies() {
  echo ""
  echo "🧹 [3c/5] 裁剪运行时依赖（按当前架构）"

  local koffi_target_platform
  case "$ARCH" in
    arm64)
      koffi_target_platform="darwin_arm64"
      ;;
    x64)
      koffi_target_platform="darwin_x64"
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
  echo "📦 [5/5] 打包 Electron App"
  # macOS 15+/Node 22+ 可能输出 [DEP0190] 到 pnpm JSON 输出流，
  # 会触发 electron-builder 的 pnpm 依赖树解析失败（No JSON content found in output）。
  # 这里关闭 Node deprecation warning，避免污染 JSON 输出。
  (cd "$ELECTRON_DIR" && NODE_NO_WARNINGS=1 pnpm exec electron-builder "${BUILDER_ARGS[@]}")
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

# ─────────────────────────────────────────────────────
# 签名与公证验证
# ─────────────────────────────────────────────────────

verify_code_signature() {
  echo ""
  echo "🔍 [6/6] 验证代码签名与公证状态"

  # 查找打包后的 .app 路径
  local app_path
  app_path=$(ls -d "$ELECTRON_DIR/release/mac-"*/Bossim.app 2>/dev/null | head -1 || true)

  if [ -z "$app_path" ]; then
    # 尝试备用路径（可能在 release/mac-arm64 或 release/mac/）
    app_path=$(ls -d "$ELECTRON_DIR/release/"*/Bossim.app 2>/dev/null | head -1 || true)
  fi

  if [ -z "$app_path" ]; then
    echo "⚠️  未找到 .app，跳过签名验证"
    return 0
  fi

  echo "📍 验证应用: $app_path"
  echo ""

  # 跳过本地快速打包（无签名）
  if [ "$LOCAL_FAST" = "1" ]; then
    echo "⏭️  LOCAL_FAST=1，跳过签名验证（无签名模式）"
    return 0
  fi

  # 1. 验证签名详情
  echo "1️⃣  检查签名详情..."
  if codesign -dv --verbose=4 "$app_path" 2>&1; then
    echo "✅ 签名详情验证通过"
  else
    echo "❌ 签名详情验证失败"
    return 1
  fi
  echo ""

  # 2. 验证签名链（深度验证 + 严格模式）
  echo "2️⃣  验证签名链（--deep --strict）..."
  if codesign --verify --deep --strict --verbose=2 "$app_path" 2>&1; then
    echo "✅ 签名链验证通过"
  else
    echo "❌ 签名链验证失败"
    return 1
  fi
  echo ""

  # 3. 验证 Gatekeeper 公证状态
  echo "3️⃣  验证 Gatekeeper 公证..."
  if spctl --assess --type exec --verbose "$app_path" 2>&1; then
    echo "✅ Gatekeeper 公证验证通过"
  else
    echo "❌ Gatekeeper 公证验证失败"
    return 1
  fi
  echo ""

  echo "🎉 所有签名验证通过！"
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
  verify_code_signature  # 验证签名与公证
  print_completion
}

main "$@"
