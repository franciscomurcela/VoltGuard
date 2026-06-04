#!/usr/bin/env bash
# Sends a keepalive to every registered sensor, marking it "online" in OAM.
# Run once after seed-sensors.sh to bring all freshly-registered devices live.
#
# In production, real devices send keepalives on their own cadence. This script
# is for demos / smoke tests where you need the dashboard to show sensors as
# active without running the full simdevices.py lifecycle simulator.
#
# Defaults to the dev port. Override:
#   OAM_BASE_URL=https://oam.voltguard.pt ./scripts/bring-sensors-online.sh
#   BEARER_TOKEN=<jwt> ./scripts/bring-sensors-online.sh
set -euo pipefail

OAM_BASE_URL="${OAM_BASE_URL:-http://localhost:8084}"
BEARER_TOKEN="${BEARER_TOKEN:-}"

CURL_AUTH=()
if [[ -n "$BEARER_TOKEN" ]]; then
  CURL_AUTH=(-H "Authorization: Bearer $BEARER_TOKEN")
fi

mapfile -t SENSORS < <(curl -ks "${CURL_AUTH[@]}" "$OAM_BASE_URL/sensors" | python3 -c "
import json, sys
d = json.load(sys.stdin)
items = d if isinstance(d, list) else d.get('items', d.get('data', []))
for s in items:
    print(f\"{s['id']}\t{s.get('name','?')}\")")

if [[ ${#SENSORS[@]} -eq 0 ]]; then
  echo "No sensors found at $OAM_BASE_URL/sensors — seed some first with ./scripts/seed-sensors.sh"
  exit 0
fi

echo "Bringing ${#SENSORS[@]} sensor(s) online ..."

ok=0
fail=0

for entry in "${SENSORS[@]}"; do
  id="${entry%%	*}"
  name="${entry##*	}"
  status=$(curl -ks -o /dev/null -w "%{http_code}" -X POST \
    "$OAM_BASE_URL/sensors/$id/keepalive" \
    -H "Content-Type: application/json" \
    "${CURL_AUTH[@]}" \
    -d '{}')
  if [[ "$status" == "200" || "$status" == "204" ]]; then
    echo "  ✓ $name ($id)"
    ok=$((ok + 1))
  else
    echo "  ✗ $name ($id) — HTTP $status"
    fail=$((fail + 1))
  fi
done

echo
echo "Done — online: $ok, failed: $fail"
exit $([ $fail -eq 0 ] && echo 0 || echo 1)
