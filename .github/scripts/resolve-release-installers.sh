#!/usr/bin/env bash
# Prints mac_dmg=, win_installer=, linux_appimage= lines for GITHUB_OUTPUT.
set -euo pipefail

REPO="${1:?owner/repo}"
TAG="${2:?tag name e.g. v0.1.0}"

# gh api --jq only accepts one expression; do not pass jq's -r there ("accepts 1 arg(s), received 2").
NAMES=$(gh api "repos/${REPO}/releases/tags/${TAG}" | jq -r '.assets // [] | .[] | .name')

pick_dmg() {
  local line
  line=$(echo "$NAMES" | grep -Ei '\.dmg$' | grep -Fi universal | head -n1 || true)
  [ -n "$line" ] && { echo "$line"; return; }
  line=$(echo "$NAMES" | grep -Ei '\.dmg$' | grep -Ei 'aarch64|arm64' | head -n1 || true)
  [ -n "$line" ] && { echo "$line"; return; }
  line=$(echo "$NAMES" | grep -Ei '\.dmg$' | grep -Ei 'x86_64|x64' | head -n1 || true)
  [ -n "$line" ] && { echo "$line"; return; }
  line=$(echo "$NAMES" | grep -Ei '\.dmg$' | head -n1 || true)
  [ -n "$line" ] && { echo "$line"; return; }
  echo ""
}

pick_win() {
  local line
  line=$(echo "$NAMES" | grep -Ei '\.msi$' | head -n1 || true)
  [ -n "$line" ] && { echo "$line"; return; }
  line=$(echo "$NAMES" | grep -Ei '\.exe$' | grep -Eiv 'uninstall' | head -n1 || true)
  [ -n "$line" ] && { echo "$line"; return; }
  echo ""
}

pick_linux() {
  local line
  line=$(echo "$NAMES" | grep -Ei '\.AppImage$' | head -n1 || true)
  [ -n "$line" ] && { echo "$line"; return; }
  echo ""
}

MAC_DMG="$(pick_dmg)"
WIN_INSTALLER="$(pick_win)"
LINUX_APPIMAGE="$(pick_linux)"

echo "mac_dmg=${MAC_DMG}"
echo "win_installer=${WIN_INSTALLER}"
echo "linux_appimage=${LINUX_APPIMAGE}"
