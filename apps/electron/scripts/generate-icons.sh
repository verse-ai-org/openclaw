#!/usr/bin/env bash
# Regenerate resources/icon.icns and resources/icon.ico from resources/icon.png.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON=python
else
  echo "Python 3 is required. Install from https://www.python.org/downloads/ then: pip install Pillow" >&2
  exit 1
fi

if ! "$PYTHON" -c "from PIL import Image" 2>/dev/null; then
  echo "Pillow is required: $PYTHON -m pip install Pillow" >&2
  exit 1
fi

exec "$PYTHON" "$SCRIPT_DIR/generate-icons.py" "$@"
