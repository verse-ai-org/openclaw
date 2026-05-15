#!/usr/bin/env bash
# Regenerate resources/icon.icns and resources/icon.ico from resources/icon.png.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$SCRIPT_DIR/generate-icons.py" "$@"
