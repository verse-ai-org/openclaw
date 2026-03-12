#!/usr/bin/env bash
# 下载指定架构的 Node.js 22 官方预编译二进制，输出到 resources/node-<arch>/node
set -euo pipefail

NODE_VERSION="22.15.0"
ARCH="${1:-arm64}"  # 参数：arm64 或 x64

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../resources/node-${ARCH}"
NODE_BINARY="$OUT_DIR/node"

# 已存在则跳过
if [ -f "$NODE_BINARY" ]; then
  echo "✅ Node ${NODE_VERSION} (${ARCH}) 已存在，跳过下载"
  exit 0
fi

DIST_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-${ARCH}.tar.gz"
echo "⬇️  正在下载 Node ${NODE_VERSION} (${ARCH}) ..."
echo "   URL: $DIST_URL"

mkdir -p "$OUT_DIR"

# 下载并解压，只提取 bin/node 二进制
curl -fsSL "$DIST_URL" \
  | tar -xz \
      --strip-components=2 \
      -C "$OUT_DIR" \
      "node-v${NODE_VERSION}-darwin-${ARCH}/bin/node"

chmod +x "$NODE_BINARY"
echo "✅ Node ${NODE_VERSION} (${ARCH}) 已保存到 $NODE_BINARY"
