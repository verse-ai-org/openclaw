#!/usr/bin/env bash
# Remove transitive packages that bloat the Electron Gateway bundle but are unused at runtime.
# Args: <PROD_DEPLOY_DIR> <ARCH> <PLATFORM>
#   PLATFORM: darwin | win
#
# Not used for on-demand installs — only strips known-dead weight after pnpm install.
set -euo pipefail

PROD_DEPLOY_DIR="${1:?prod deploy dir}"
ARCH="${2:?arch}"
PLATFORM="${3:?platform}"

NM="$PROD_DEPLOY_DIR/node_modules"
if [[ ! -d "$NM" ]]; then
  echo "⚠️  prune-electron-node-modules: missing $NM"
  exit 0
fi

echo ""
echo "🧹 [3b2/5] 裁剪 Electron 运行时 node_modules 冗余传递依赖"

rm_pnpm_and_hoist() {
  local name_glob="$1"
  shopt -s nullglob
  local d
  for d in "$NM/.pnpm"/$name_glob; do
    rm -rf "$d"
  done
  shopt -u nullglob
}

# Pure types — never executed by Node at runtime.
rm -rf "$NM/@cloudflare/workers-types"
rm_pnpm_and_hoist '@cloudflare+workers-types@*'

# jiti declares react-dom for optional tooling; Gateway does not render React in-process.
rm -rf "$NM/react" "$NM/react-dom"
rm_pnpm_and_hoist 'react-dom@*'
rm_pnpm_and_hoist 'react@*'
# pnpm also hoists peers under .pnpm/node_modules/; those symlinks survive store deletion and
# break electron-builder (ENOENT when following stat during packaging).
rm -rf "$NM/.pnpm/node_modules/react" "$NM/.pnpm/node_modules/react-dom"

# macOS arm64: universal Mario clipboard duplicates the arm64 slice (~4MB).
if [[ "$PLATFORM" == "darwin" && "$ARCH" == "arm64" ]]; then
  rm -rf "$NM/@mariozechner/clipboard-darwin-universal"
  rm_pnpm_and_hoist '@mariozechner+clipboard-darwin-universal@*'
fi

# Removing react leaves dangling symlinks under .pnpm/* (e.g. @pierre+diffs@…/node_modules/react).
# electron-builder stat() follows links and fails with ENOENT; drop all broken symlinks.
find "$NM" -type l 2>/dev/null | while IFS= read -r link; do
  [[ -e "$link" ]] || rm -f "$link"
done

echo "✅ Electron node_modules 冗余裁剪完成"
