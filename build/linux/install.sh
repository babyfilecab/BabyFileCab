#!/usr/bin/env bash
# Install BabyFileCab for the current user so it appears in the app menu.
#   ./build/linux/install.sh            build (if needed) and install
#   ./install.sh                        same, from an extracted release download
#   ./build/linux/install.sh --uninstall
# Everything goes under ~/.local; no root access is needed. Your data in
# ~/BabyFileCabData is never touched by install or uninstall.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
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

if [[ -x "$HERE/BabyFileCab" ]]; then
  # Running from an extracted release download.
  BINARY="$HERE/BabyFileCab"
  ICON="$HERE/babyfilecab.png"
  TEMPLATE="$HERE/babyfilecab.desktop.in"
else
  # Running from the source tree.
  BINARY="$ROOT/build/bin/BabyFileCab"
  ICON="$ROOT/build/appicon.png"
  TEMPLATE="$HERE/babyfilecab.desktop.in"
  if [[ ! -x "$BINARY" || "${1:-}" == "--rebuild" ]]; then
    echo "Building BabyFileCab..."
    (cd "$ROOT" && wails build -tags webkit2_41)
  fi
fi

mkdir -p "$APP_DIR" "$DESKTOP_DIR" "$(dirname "$BIN_LINK")"
install -m 0755 "$BINARY" "$APP_DIR/BabyFileCab"
install -m 0644 "$ICON" "$APP_DIR/babyfilecab.png"
ln -sf "$APP_DIR/BabyFileCab" "$BIN_LINK"
sed -e "s|@BIN@|$APP_DIR/BabyFileCab|" \
    -e "s|@ICON@|$APP_DIR/babyfilecab.png|" \
    -e "s|@WMCLASS@|BabyFileCab|" \
    "$TEMPLATE" > "$DESKTOP_FILE"
chmod 0644 "$DESKTOP_FILE"
refresh_menu

echo "Installed. Open BabyFileCab from your app menu (Office), or run: babyfilecab"
