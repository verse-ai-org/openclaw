#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

echo "Ready. Usage:"
echo "  source .venv/bin/activate"
echo "  python ods.py template-report --output report.docx --title 'Q1 Analysis' --author 'John'"
