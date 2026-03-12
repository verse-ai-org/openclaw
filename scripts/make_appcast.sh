#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)

# Parse --beta flag before positional args.
IS_BETA=0
ARGS=()
for arg in "$@"; do
  if [[ "$arg" == "--beta" ]]; then
    IS_BETA=1
  else
    ARGS+=("$arg")
  fi
done
set -- "${ARGS[@]}"

ZIP=${1:?"Usage: $0 [--beta] OpenClaw-<ver>.zip [feed_url]"}

# Choose the correct feed URL and output appcast file based on channel.
if [[ "$IS_BETA" == "1" ]]; then
  DEFAULT_FEED_URL="https://raw.githubusercontent.com/openclaw/openclaw/main/appcast-beta.xml"
  APPCAST_OUT="$ROOT/appcast-beta.xml"
else
  DEFAULT_FEED_URL="https://raw.githubusercontent.com/openclaw/openclaw/main/appcast.xml"
  APPCAST_OUT="$ROOT/appcast.xml"
fi

FEED_URL=${2:-"$DEFAULT_FEED_URL"}
PRIVATE_KEY_FILE=${SPARKLE_PRIVATE_KEY_FILE:-}
if [[ -z "$PRIVATE_KEY_FILE" ]]; then
  echo "Set SPARKLE_PRIVATE_KEY_FILE to your ed25519 private key (Sparkle)." >&2
  exit 1
fi
if [[ ! -f "$ZIP" ]]; then
  echo "Zip not found: $ZIP" >&2
  exit 1
fi

ZIP_DIR=$(cd "$(dirname "$ZIP")" && pwd)
ZIP_NAME=$(basename "$ZIP")
ZIP_BASE="${ZIP_NAME%.zip}"
VERSION=${SPARKLE_RELEASE_VERSION:-}
if [[ -z "$VERSION" ]]; then
  # Accept legacy calver suffixes like -1 and prerelease forms like -beta.1 / .beta.1.
  if [[ "$ZIP_NAME" =~ ^OpenClaw-([0-9]+(\.[0-9]+){1,2}([-.][0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?)\.zip$ ]]; then
    VERSION="${BASH_REMATCH[1]}"
  else
    echo "Could not infer version from $ZIP_NAME; set SPARKLE_RELEASE_VERSION." >&2
    exit 1
  fi
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
  if [[ "${KEEP_SPARKLE_NOTES:-0}" != "1" ]]; then
    rm -f "$NOTES_HTML"
  fi
}
trap cleanup EXIT
cp -f "$ZIP" "$TMP_DIR/$ZIP_NAME"
if [[ -f "$APPCAST_OUT" ]]; then
  cp -f "$APPCAST_OUT" "$TMP_DIR/appcast.xml"
elif [[ -f "$ROOT/appcast.xml" && "$IS_BETA" == "0" ]]; then
  cp -f "$ROOT/appcast.xml" "$TMP_DIR/appcast.xml"
fi

NOTES_HTML="${ZIP_DIR}/${ZIP_BASE}.html"
if [[ -x "$ROOT/scripts/changelog-to-html.sh" ]]; then
  "$ROOT/scripts/changelog-to-html.sh" "$VERSION" >"$NOTES_HTML"
else
  echo "Missing scripts/changelog-to-html.sh; cannot generate HTML release notes." >&2
  exit 1
fi
cp -f "$NOTES_HTML" "$TMP_DIR/${ZIP_BASE}.html"

DOWNLOAD_URL_PREFIX=${SPARKLE_DOWNLOAD_URL_PREFIX:-"https://github.com/openclaw/openclaw/releases/download/v${VERSION}/"}

export PATH="$ROOT/apps/macos/.build/artifacts/sparkle/Sparkle/bin:$PATH"
if ! command -v generate_appcast >/dev/null; then
  echo "generate_appcast not found in PATH. Build Sparkle tools via SwiftPM." >&2
  exit 1
fi

generate_appcast \
  --ed-key-file "$PRIVATE_KEY_FILE" \
  --download-url-prefix "$DOWNLOAD_URL_PREFIX" \
  --embed-release-notes \
  --link "$FEED_URL" \
  "$TMP_DIR"

cp -f "$TMP_DIR/appcast.xml" "$APPCAST_OUT"

if [[ "$IS_BETA" == "1" ]]; then
  echo "Beta appcast generated (appcast-beta.xml). Upload alongside $ZIP at $FEED_URL"
else
  echo "Appcast generated (appcast.xml). Upload alongside $ZIP at $FEED_URL"
fi
