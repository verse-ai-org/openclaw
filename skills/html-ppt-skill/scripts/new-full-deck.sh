#!/usr/bin/env bash
# html-ppt :: new-full-deck.sh — scaffold a self-contained deck from templates/full-decks/<name>
#
# Usage:
#   new-full-deck.sh <template-name> <deck-name> [output-parent-dir]
#
# Creates a self-contained deck at <parent>/<deck-name>/ with:
#   - index.html
#   - style.css
#   - assets/
# and rewrites template asset paths to local ./assets references.

set -euo pipefail

TEMPLATE_NAME="${1:-}"
DECK_NAME="${2:-}"

if [[ -z "$TEMPLATE_NAME" || -z "$DECK_NAME" ]]; then
  echo "usage: new-full-deck.sh <template-name> <deck-name> [parent-dir]" >&2
  exit 1
fi

HERE="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE_DIR="$HERE/templates/full-decks/$TEMPLATE_NAME"
TEMPLATE_INDEX="$TEMPLATE_DIR/index.html"
TEMPLATE_STYLE="$TEMPLATE_DIR/style.css"

if [[ ! -d "$TEMPLATE_DIR" ]]; then
  echo "error: template not found: $TEMPLATE_DIR" >&2
  exit 1
fi
if [[ ! -f "$TEMPLATE_INDEX" ]]; then
  echo "error: template index not found: $TEMPLATE_INDEX" >&2
  exit 1
fi
if [[ ! -f "$TEMPLATE_STYLE" ]]; then
  echo "error: template style not found: $TEMPLATE_STYLE" >&2
  exit 1
fi

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

PARENT="${3:-$(default_parent_dir)}"

if [[ "$PARENT" == /* ]]; then
  OUT_DIR="$PARENT/$DECK_NAME"
else
  OUT_DIR="$HERE/$PARENT/$DECK_NAME"
fi

if [[ -e "$OUT_DIR" ]]; then
  echo "error: $OUT_DIR already exists" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
cp -R "$HERE/assets" "$OUT_DIR/assets"
cp "$TEMPLATE_STYLE" "$OUT_DIR/style.css"

python3 - "$TEMPLATE_INDEX" "$OUT_DIR/index.html" <<'PY'
import sys

tpl_path, out_path = sys.argv[1], sys.argv[2]

with open(tpl_path, "r", encoding="utf-8") as f:
    html = f.read()

# full-deck templates reference skill-root assets as ../../../assets/*
html = html.replace('href="../../../assets/', 'href="./assets/')
html = html.replace('src="../../../assets/', 'src="./assets/')
html = html.replace('href="style.css"', 'href="./style.css"')
html = html.replace('src="style.css"', 'src="./style.css"')

with open(out_path, "w", encoding="utf-8") as f:
    f.write(html)
PY

echo "✔ created $OUT_DIR/index.html"
echo "✔ created $OUT_DIR/style.css"
echo "✔ copied  $OUT_DIR/assets/"
echo ""
echo "next steps:"
echo "  open  $OUT_DIR/index.html"
echo "  # press T to cycle themes, ← → to navigate, O for overview"
