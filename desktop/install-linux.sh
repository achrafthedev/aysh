#!/bin/bash
# Installs an Aysh entry in your Linux applications menu, backed by a
# native (non-Docker) Python venv. Run from anywhere; it resolves paths
# relative to this script, so it works from any checkout location.
#
# What this does NOT do: register anything to start at boot or login.
# The launcher it installs only starts Aysh's server on demand, the first
# time you open the app from the menu, and leaves it running in the
# background until you log out or kill it — the same tradeoff as any
# desktop app with a helper process.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

echo "Installing Aysh desktop launcher for $APP_DIR"

# Pick the first free port starting at 7000 — useful if you're also running
# the Docker Compose stack (or another Aysh/Odysseus checkout) locally.
PORT=7000
while (echo >/dev/tcp/127.0.0.1/$PORT) 2>/dev/null; do
  PORT=$((PORT + 1))
done
echo "Using port $PORT"

if [ ! -d "$APP_DIR/venv" ]; then
  echo "Creating venv and installing dependencies (this takes a few minutes)..."
  python3 -m venv "$APP_DIR/venv"
  "$APP_DIR/venv/bin/pip" install -q -r "$APP_DIR/requirements.txt"
fi

if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
fi

mkdir -p "$HOME/.local/bin" "$HOME/.local/share/applications"

LAUNCHER="$HOME/.local/bin/aysh-launcher.sh"
sed -e "s#__APP_DIR__#$APP_DIR#g" -e "s#__PORT__#$PORT#g" \
  "$SCRIPT_DIR/aysh-launcher.sh.template" > "$LAUNCHER"
chmod +x "$LAUNCHER"

DESKTOP_FILE="$HOME/.local/share/applications/aysh.desktop"
sed -e "s#__LAUNCHER_PATH__#$LAUNCHER#g" -e "s#__ICON_PATH__#$APP_DIR/docs/aysh-icon.svg#g" \
  "$SCRIPT_DIR/aysh.desktop.template" > "$DESKTOP_FILE"
chmod +x "$DESKTOP_FILE"

command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$HOME/.local/share/applications" || true

echo "Done. Aysh should now appear in your applications menu."
echo "First launch will start the server at http://127.0.0.1:$PORT — the admin"
echo "password is printed to $APP_DIR/logs/aysh-launcher.log on first boot."
