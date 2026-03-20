#!/usr/bin/env bash
set -euo pipefail

USER_ID="${1:-}"
API_BASE_URL="${API_BASE_URL:-http://localhost:8080}"
SOURCE_ID="${SOURCE_ID:-sensor_teste_01}"
METRIC_NAME="${METRIC_NAME:-voltage}"
VALUE="${VALUE:-821.4}"
SEVERITY="${SEVERITY:-HIGH}"
ALERT_TYPE="${ALERT_TYPE:-critical}"
MESSAGE_TEMPLATE="${MESSAGE_TEMPLATE:-}"

if [[ -z "$USER_ID" ]]; then
  echo "Usage: $0 <user_id>"
  echo "Example: $0 op_joao_silva"
  exit 1
fi

URI="$API_BASE_URL/api/anomalies/simulate-notification"

if [[ -n "$MESSAGE_TEMPLATE" ]]; then
  BODY=$(cat <<JSON
{"user_id":"$USER_ID","source_id":"$SOURCE_ID","metric_name":"$METRIC_NAME","value":$VALUE,"severity":"$SEVERITY","alert_type":"$ALERT_TYPE","message_template":"$MESSAGE_TEMPLATE"}
JSON
)
else
  BODY=$(cat <<JSON
{"user_id":"$USER_ID","source_id":"$SOURCE_ID","metric_name":"$METRIC_NAME","value":$VALUE,"severity":"$SEVERITY","alert_type":"$ALERT_TYPE"}
JSON
)
fi

echo "POST $URI"
curl -sS -X POST "$URI" \
  -H "Content-Type: application/json" \
  -d "$BODY"
echo
