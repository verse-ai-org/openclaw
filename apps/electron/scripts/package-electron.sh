#!/usr/bin/env bash
# 打包 Electron macOS 客户端
# 产物输出到 apps/electron/release/
set -euo pipefail

ELECTRON_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT_DIR="$(cd "$ELECTRON_DIR/../.." && pwd)"
ARCH="${ARCH:-$(uname -m | sed 's/x86_64/x64/')}"

echo "======================================"
echo "  OpenClaw Electron macOS 打包"
echo "  架构: $ARCH"
echo "======================================"

echo ""
echo "📦 [1/5] 构建 openclaw CLI (pnpm build)"
(cd "$ROOT_DIR" && pnpm build)

echo ""
echo "🖥  [2/5] 构建 Control UI (pnpm ui:build)"
(cd "$ROOT_DIR" && node scripts/ui.js build)

echo ""
echo "⬇️  [3/5] 下载 Node 22 二进制 ($ARCH)"
bash "$ELECTRON_DIR/scripts/download-node.sh" "$ARCH"

echo ""
echo "🔨 [4/5] 构建 Electron 主进程"
(cd "$ELECTRON_DIR" && pnpm build)

echo ""
echo "📦 [5/5] 打包 Electron App"
(cd "$ELECTRON_DIR" && pnpm exec electron-builder --mac --${ARCH})

echo ""
echo "✅ 完成！产物位于: $ELECTRON_DIR/release/"
ls -lh "$ELECTRON_DIR/release/" 2>/dev/null || true
