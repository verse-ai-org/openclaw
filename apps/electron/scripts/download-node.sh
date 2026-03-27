#!/usr/bin/env bash
# 下载指定平台/架构的 Node.js 22 官方预编译二进制
# 用法：download-node.sh [arch] [platform]
#   arch:     arm64 | x64  （默认 arm64）
#   platform: darwin | win  （默认 darwin）
#
# 输出路径：
#   macOS/Linux → resources/node-<arch>/node
#   Windows     → resources/node-<arch>/node.exe
set -euo pipefail

NODE_VERSION="22.15.0"
ARCH="${1:-arm64}"      # arm64 或 x64
PLATFORM="${2:-darwin}" # darwin 或 win

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../resources/node-${ARCH}"

if [ "$PLATFORM" = "win" ]; then
  NODE_BINARY="$OUT_DIR/node.exe"
else
  NODE_BINARY="$OUT_DIR/node"
fi

# 已存在则跳过
if [ -f "$NODE_BINARY" ]; then
  echo "✅ Node ${NODE_VERSION} (${PLATFORM}-${ARCH}) 已存在，跳过下载"
  exit 0
fi

mkdir -p "$OUT_DIR"

if [ "$PLATFORM" = "win" ]; then
  # Windows：下载 .zip，解压取 node.exe
  DIST_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-${ARCH}.zip"
  TMP_ZIP="$(mktemp /tmp/node-win-XXXXXX.zip)"
  echo "⬇️  正在下载 Node ${NODE_VERSION} (win-${ARCH}) ..."
  echo "   URL: $DIST_URL"
  curl -fsSL -o "$TMP_ZIP" "$DIST_URL"
  # 从 zip 中提取 node.exe（位于 node-vX.Y.Z-win-ARCH/node.exe）
  unzip -jo "$TMP_ZIP" "node-v${NODE_VERSION}-win-${ARCH}/node.exe" -d "$OUT_DIR"
  rm -f "$TMP_ZIP"
  echo "✅ Node ${NODE_VERSION} (win-${ARCH}) 已保存到 $NODE_BINARY"
else
  # macOS / Linux：下载 .tar.gz，解压取 bin/node
  DIST_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-${ARCH}.tar.gz"
  echo "⬇️  正在下载 Node ${NODE_VERSION} (darwin-${ARCH}) ..."
  echo "   URL: $DIST_URL"
  curl -fsSL "$DIST_URL" \
    | tar -xz \
        --strip-components=2 \
        -C "$OUT_DIR" \
        "node-v${NODE_VERSION}-darwin-${ARCH}/bin/node"
  chmod +x "$NODE_BINARY"
  echo "✅ Node ${NODE_VERSION} (darwin-${ARCH}) 已保存到 $NODE_BINARY"
fi
