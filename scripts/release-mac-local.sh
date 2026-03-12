#!/usr/bin/env bash
set -euo pipefail

# Local macOS release helper for OpenClaw.
#
# Usage:
#   scripts/release-mac-local.sh --dev      # ad-hoc sign, no notarize, Sparkle disabled (local test only)
#   scripts/release-mac-local.sh --release  # Developer ID sign + notarize + appcast update (publish-ready)
#
# Env (--release mode):
#   SIGN_IDENTITY        Developer ID Application cert name (auto-detected if unset)
#   SPARKLE_PRIVATE_KEY_FILE   Path to ed25519 Sparkle private key (required for appcast)
#   NOTARYTOOL_PROFILE   Keychain profile for xcrun notarytool (OR use NOTARYTOOL_KEY/ID/ISSUER)
#   NOTARYTOOL_KEY       Path to App Store Connect .p8 key file
#   NOTARYTOOL_KEY_ID    App Store Connect key ID
#   NOTARYTOOL_ISSUER    App Store Connect issuer ID
#
# Output (dist/):
#   OpenClaw.app
#   OpenClaw-<version>.zip
#   OpenClaw-<version>.dmg
#   OpenClaw-<version>.dSYM.zip  (--release only)
#   appcast.xml / appcast-beta.xml updated  (--release only, requires SPARKLE_PRIVATE_KEY_FILE)

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ── Colours ──────────────────────────────────────────────────────────────────
BOLD='\033[1m'
SUCCESS='\033[38;2;0;229;204m'
WARN='\033[38;2;255;176;32m'
ERROR='\033[38;2;230;57;70m'
INFO='\033[38;2;136;146;176m'
NC='\033[0m'

ui_step()    { echo -e "\n${BOLD}▶ $*${NC}"; }
ui_ok()      { echo -e "${SUCCESS}✓${NC} $*"; }
ui_warn()    { echo -e "${WARN}!${NC} $*"; }
ui_error()   { echo -e "${ERROR}✗${NC} $*" >&2; }
ui_info()    { echo -e "${INFO}·${NC} $*"; }

# ── Argument parsing ──────────────────────────────────────────────────────────
MODE=""
for arg in "$@"; do
  case "$arg" in
    --dev)     MODE="dev" ;;
    --release) MODE="release" ;;
    --help|-h)
      sed -n '3,20p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      ui_error "Unknown argument: $arg"
      echo "Usage: $0 --dev | --release" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$MODE" ]]; then
  ui_error "Mode required: --dev or --release"
  echo "Usage: $0 --dev | --release" >&2
  exit 1
fi

# ── Read version ──────────────────────────────────────────────────────────────
PKG_VERSION="$(node -p "require('$ROOT_DIR/package.json').version" 2>/dev/null || echo "0.0.0")"
APP_VERSION="${APP_VERSION:-$PKG_VERSION}"

# Detect beta: version contains -beta.N or legacy -N suffix.
IS_BETA=0
if [[ "$APP_VERSION" =~ -beta\.?[0-9]+$ ]] || [[ "$APP_VERSION" =~ -[0-9]+$ ]]; then
  IS_BETA=1
fi

echo ""
echo -e "${BOLD}OpenClaw macOS Local Release${NC}"
ui_info "Version : $APP_VERSION"
ui_info "Channel : $([ "$IS_BETA" -eq 1 ] && echo 'beta' || echo 'stable')"
ui_info "Mode    : $MODE"
echo ""

# ── Dev mode ──────────────────────────────────────────────────────────────────
if [[ "$MODE" == "dev" ]]; then
  ui_step "Building (dev/ad-hoc) — no notarization, Sparkle disabled"

  ALLOW_ADHOC_SIGNING=1 \
  SKIP_NOTARIZE=1 \
  BUNDLE_ID=ai.openclaw.mac.debug \
  BUILD_CONFIG=release \
  APP_VERSION="$APP_VERSION" \
    "$ROOT_DIR/scripts/package-mac-dist.sh"

  ui_ok "Dev build complete → dist/OpenClaw.app"
  ui_warn "Ad-hoc signed: permissions (mic, camera, etc.) will NOT persist across restarts."
  ui_warn "Sparkle auto-update is DISABLED in this build (debug bundle ID)."
  echo ""
  ui_info "To open: open dist/OpenClaw.app"
  exit 0
fi

# ── Release mode ──────────────────────────────────────────────────────────────
ui_step "Pre-flight checks"

# Verify signing identity is reachable (or will be auto-selected).
if [[ -z "${SIGN_IDENTITY:-}" ]]; then
  DETECTED_ID="$(security find-identity -p codesigning -v 2>/dev/null \
    | awk -F'"' '/Developer ID Application/ { print $2; exit }')"
  if [[ -z "$DETECTED_ID" ]]; then
    ui_error "No 'Developer ID Application' certificate found in keychain."
    ui_error "Set SIGN_IDENTITY or install a valid Developer ID cert."
    exit 1
  fi
  ui_info "Auto-detected signing identity: $DETECTED_ID"
else
  ui_info "Using signing identity: $SIGN_IDENTITY"
fi

# Sparkle key check (warn, don't block — appcast step will fail on its own if missing).
if [[ -z "${SPARKLE_PRIVATE_KEY_FILE:-}" ]]; then
  ui_warn "SPARKLE_PRIVATE_KEY_FILE not set — appcast will NOT be updated after packaging."
  ui_warn "Set it to your ed25519 Sparkle private key path to auto-update the appcast."
fi

ui_step "Building release artifact (universal, Developer ID signed, notarized)"

BUILD_CONFIG=release \
BUNDLE_ID=ai.openclaw.mac \
APP_VERSION="$APP_VERSION" \
  "$ROOT_DIR/scripts/package-mac-dist.sh"

VERSION="$APP_VERSION"
ZIP="$ROOT_DIR/dist/OpenClaw-${VERSION}.zip"
DMG="$ROOT_DIR/dist/OpenClaw-${VERSION}.dmg"
DSYM_ZIP="$ROOT_DIR/dist/OpenClaw-${VERSION}.dSYM.zip"

ui_ok "Artifacts ready:"
[[ -f "$ZIP" ]]      && ui_info "  $ZIP"
[[ -f "$DMG" ]]      && ui_info "  $DMG"
[[ -f "$DSYM_ZIP" ]] && ui_info "  $DSYM_ZIP"

# ── Appcast update ────────────────────────────────────────────────────────────
if [[ -n "${SPARKLE_PRIVATE_KEY_FILE:-}" ]]; then
  ui_step "Updating appcast"

  APPCAST_FLAG=""
  if [[ "$IS_BETA" -eq 1 ]]; then
    APPCAST_FLAG="--beta"
    APPCAST_FILE="appcast-beta.xml"
  else
    APPCAST_FILE="appcast.xml"
  fi

  SPARKLE_PRIVATE_KEY_FILE="$SPARKLE_PRIVATE_KEY_FILE" \
    "$ROOT_DIR/scripts/make_appcast.sh" $APPCAST_FLAG "$ZIP"

  ui_ok "Updated $APPCAST_FILE"
else
  ui_warn "Skipping appcast update (SPARKLE_PRIVATE_KEY_FILE not set)."
fi

# ── Next steps ────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Next steps:${NC}"
echo ""

GH_TAG="v${VERSION}"
RELEASE_FLAG="$([ "$IS_BETA" -eq 1 ] && echo '--prerelease' || echo '')"

ui_info "1. Create GitHub Release and upload artifacts:"
echo "     gh release create $GH_TAG --title \"OpenClaw $VERSION\" $RELEASE_FLAG \\"
echo "       dist/OpenClaw-${VERSION}.zip \\"
echo "       dist/OpenClaw-${VERSION}.dmg \\"
[[ -f "$DSYM_ZIP" ]] && echo "       dist/OpenClaw-${VERSION}.dSYM.zip \\"
echo "       --notes-file <(scripts/changelog-to-html.sh $VERSION)"
echo ""

if [[ -n "${SPARKLE_PRIVATE_KEY_FILE:-}" ]]; then
  APPCAST_OUT="$([ "$IS_BETA" -eq 1 ] && echo 'appcast-beta.xml' || echo 'appcast.xml')"
  ui_info "2. Commit updated $APPCAST_OUT and open a PR to main:"
  echo "     git checkout -b bot/appcast-update-${VERSION}"
  echo "     git add $APPCAST_OUT"
  echo "     git commit -m \"chore: update $APPCAST_OUT for $VERSION\""
  echo "     git push origin bot/appcast-update-${VERSION}"
  echo "     gh pr create --title \"chore: update $APPCAST_OUT for $VERSION\" \\"
  echo "       --body \"Automated appcast update for $VERSION release.\" \\"
  echo "       --base main --label appcast"
  echo ""
  ui_info "3. Once the PR is merged, Sparkle will serve the update at:"
  if [[ "$IS_BETA" -eq 1 ]]; then
    echo "     https://raw.githubusercontent.com/openclaw/openclaw/main/appcast-beta.xml"
  else
    echo "     https://raw.githubusercontent.com/openclaw/openclaw/main/appcast.xml"
  fi
else
  ui_info "2. Run make_appcast.sh after setting SPARKLE_PRIVATE_KEY_FILE, then open a PR."
fi
echo ""
