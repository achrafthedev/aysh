#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="$SCRIPT_DIR/aysh-ui.service"

if [ ! -f "$SERVICE_FILE" ]; then
  echo "Error: aysh-ui.service not found in $SCRIPT_DIR"
  exit 1
fi

echo "Installing Aysh UI service..."
echo "Make sure you've edited aysh-ui.service with your username and paths first!"
echo ""

sudo cp "$SERVICE_FILE" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable aysh-ui
sudo systemctl start aysh-ui
sudo systemctl status aysh-ui
