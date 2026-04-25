#!/usr/bin/env bash
# html-ppt :: new-deck.sh — scaffold a new deck from templates/deck.html
#
# Usage:
#   new-deck.sh <name> [output-parent-dir]
#
# Creates a self-contained deck at <parent>/<name>/ by copying `assets/` and
# rewriting template paths to local `./assets/...`. Defaults to Documents/Bossim/Html.

set -euo pipefail

NAME="${1:-}"
if [[ -z "$NAME" ]]; then
  echo "usage: new-deck.sh <name> [parent-dir]" >&2
  exit 1
fi

HERE="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="$HERE/templates/deck.html"

to_unix_path() {
  local p="$1"
  p="${p//\\//}"
  echo "$p"
}

default_parent_dir() {
  if [[ -n "${HOME:-}" && -d "$HOME/Documents" ]]; then
    echo "$HOME/Documents/Bossim/Html"
    return
  fi
  if [[ -n "${USERPROFILE:-}" ]]; then
    local win_home
    win_home="$(to_unix_path "$USERPROFILE")"
    echo "$win_home/Documents/Bossim/Html"
    return
  fi
  echo "$HERE/examples"
}

PARENT="${2:-$(default_parent_dir)}"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "error: template not found at $TEMPLATE" >&2
  exit 1
fi

if [[ "$PARENT" == /* ]]; then
  OUT_DIR="$PARENT/$NAME"
else
  OUT_DIR="$HERE/$PARENT/$NAME"
fi
if [[ -e "$OUT_DIR" ]]; then
  echo "error: $OUT_DIR already exists" >&2
  exit 1
fi
mkdir -p "$OUT_DIR"
cp -R "$HERE/assets" "$OUT_DIR/assets"

python3 - "$TEMPLATE" "$OUT_DIR/index.html" <<'PY'
import sys

tpl_path, out_path = sys.argv[1], sys.argv[2]
prefix = "./assets/"

with open(tpl_path, "r", encoding="utf-8") as f:
    html = f.read()

html = html.replace('href="../assets/', f'href="{prefix}')
html = html.replace('src="../assets/', f'src="{prefix}')
html = html.replace('data-theme-base="../assets/', f'data-theme-base="{prefix}')

with open(out_path, "w", encoding="utf-8") as f:
    f.write(html)
PY

echo "✔ created $OUT_DIR/index.html"
echo ""
echo "next steps:"
echo "  open  $OUT_DIR/index.html"
echo "  # press T to cycle themes, ← → to navigate, O for overview"
echo ""
echo "  # render to PNG:"
echo "  $HERE/scripts/render.sh $OUT_DIR/index.html all"
