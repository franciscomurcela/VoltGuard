#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:8083}"
AUTH_TOKEN="${AUTH_TOKEN:-your_secure_auth_token}"
BATCH_SIZE="${BATCH_SIZE:-50}"
DRY_RUN="${DRY_RUN:-true}"

if ! [[ "$BATCH_SIZE" =~ ^[0-9]+$ ]] || [ "$BATCH_SIZE" -lt 1 ] || [ "$BATCH_SIZE" -gt 500 ]; then
  echo "BATCH_SIZE must be an integer between 1 and 500."
  exit 1
fi

URI="$API_BASE_URL/v1/digest/process?auth_token=$AUTH_TOKEN"
BODY=$(cat <<JSON
{"batch_size":$BATCH_SIZE,"dry_run":$DRY_RUN}
JSON
)

echo "POST $URI"
curl -sS -X POST "$URI" \
  -H "Content-Type: application/json" \
  -d "$BODY"
echo
