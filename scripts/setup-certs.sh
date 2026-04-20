#!/usr/bin/env bash
set -e

CERTS_DIR="$(cd "$(dirname "$0")/.." && pwd)/kong/certs"
DOMAINS="*.voltguard.pt voltguard.pt auth.voltguard.pt composer.voltguard.pt oam.voltguard.pt notifications.voltguard.pt"

echo "==> Checking mkcert..."
if ! command -v mkcert &>/dev/null; then
  echo "==> Installing mkcert..."
  sudo apt-get install -y mkcert libnss3-tools
fi

echo "==> Installing local CA (requires sudo)..."
mkcert -install

echo "==> Generating certificates in $CERTS_DIR..."
mkdir -p "$CERTS_DIR"
mkcert -cert-file "$CERTS_DIR/cert.pem" -key-file "$CERTS_DIR/key.pem" $DOMAINS

echo ""
echo "Done! Restart Firefox, then run:"
echo "  sudo docker compose restart kong"
