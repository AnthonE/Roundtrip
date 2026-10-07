#!/usr/bin/env bash
# Pull the latest code and restart the API. Run on the VM from anywhere:
#   sudo /opt/roundtrip/deploy/update.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/roundtrip}"
APP_USER="${APP_USER:-roundtrip}"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"
sudo -u "$APP_USER" git fetch --quiet origin "$BRANCH"
sudo -u "$APP_USER" git merge --ff-only "origin/$BRANCH"
cd server
sudo -u "$APP_USER" npm ci --omit=dev --no-audit --no-fund
systemctl restart roundtrip-api
sleep 1
curl -fsS http://127.0.0.1:8787/api/health && echo
echo "updated to $(git -C "$APP_DIR" rev-parse --short HEAD)"
