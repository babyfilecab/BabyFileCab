#!/usr/bin/env bash
# Install BabyFileCab for the current user so it appears in the app menu.
#   ./build/linux/install.sh            build (if needed) and install
#   ./build/linux/install.sh --uninstall
# Everything goes under ~/.local; no root access is needed. Your data in
# ~/BabyFileCabData is never touched by install or uninstall.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/babyfilecab"
DESKTOP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DESKTOP_FILE="$DESKTOP_DIR/babyfilecab.desktop"
BIN_LINK="$HOME/.local/bin/babyfilecab"

refresh_menu() {
  command -v update-desktop-database >/dev/null && update-desktop-database -q "$DESKTOP_DIR" || true
}

if [[ "${1:-}" == "--uninstall" ]]; then
  rm -f "$DESKTOP_FILE" "$BIN_LINK"
  rm -rf "$APP_DIR"
  refresh_menu
  echo "BabyFileCab removed from the app menu. Your data in ~/BabyFileCabData was not touched."
  exit 0
fi

BINARY="$ROOT/build/bin/BabyFileCab"
if [[ ! -x "$BINARY" || "${1:-}" == "--rebuild" ]]; then
  echo "Building BabyFileCab..."
  (cd "$ROOT" && wails build -tags webkit2_41)
fi

mkdir -p "$APP_DIR" "$DESKTOP_DIR" "$(dirname "$BIN_LINK")"
install -m 0755 "$BINARY" "$APP_DIR/BabyFileCab"
install -m 0644 "$ROOT/build/appicon.png" "$APP_DIR/babyfilecab.png"
ln -sf "$APP_DIR/BabyFileCab" "$BIN_LINK"
sed -e "s|@BIN@|$APP_DIR/BabyFileCab|" \
    -e "s|@ICON@|$APP_DIR/babyfilecab.png|" \
    -e "s|@WMCLASS@|BabyFileCab|" \
    "$ROOT/build/linux/babyfilecab.desktop.in" > "$DESKTOP_FILE"
chmod 0644 "$DESKTOP_FILE"
refresh_menu

echo "Installed. Open BabyFileCab from your app menu (Office), or run: babyfilecab"
