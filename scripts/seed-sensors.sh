#!/usr/bin/env bash
# Seeds sensors into the OAM service.
#
# Default targets the dev port published by docker-compose.override.yaml
# (oam-service on host:8084). Override via OAM_BASE_URL for staging/prod:
#   OAM_BASE_URL=https://oam.voltguard.pt ./scripts/seed-sensors.sh
#
# If OAM has /sensors auth enabled in your deployment, pass a Bearer token:
#   BEARER_TOKEN=<jwt> ./scripts/seed-sensors.sh
#
# To use a custom sensor list, pass a JSON file as the first argument:
#   ./scripts/seed-sensors.sh path/to/sensors.json
#
# JSON file format: a top-level array of {name, district} objects, e.g.
#   [
#     {"name": "Lisboa-03", "district": "Lisboa"},
#     {"name": "Faro-01",   "district": "Faro"}
#   ]
set -euo pipefail

OAM_BASE_URL="${OAM_BASE_URL:-http://localhost:8084}"
BEARER_TOKEN="${BEARER_TOKEN:-}"
SENSORS_FILE="${1:-}"

# Built-in defaults — covers all 16 mainland districts the PortugalMap renders,
# with 2-4 sensors per district weighted toward urban centres. Edit this list
# or override with a JSON file argument.
DEFAULT_SENSORS=(
  '{"name":"Lisboa-01","district":"Lisboa"}'
  '{"name":"Lisboa-02","district":"Lisboa"}'
  '{"name":"Lisboa-03","district":"Lisboa"}'
  '{"name":"Lisboa-04","district":"Lisboa"}'
  '{"name":"Porto-01","district":"Porto"}'
  '{"name":"Porto-02","district":"Porto"}'
  '{"name":"Porto-03","district":"Porto"}'
  '{"name":"Porto-04","district":"Porto"}'
  '{"name":"Setubal-01","district":"Setúbal"}'
  '{"name":"Setubal-02","district":"Setúbal"}'
  '{"name":"Setubal-03","district":"Setúbal"}'
  '{"name":"Faro-01","district":"Faro"}'
  '{"name":"Faro-02","district":"Faro"}'
  '{"name":"Faro-03","district":"Faro"}'
  '{"name":"Coimbra-01","district":"Coimbra"}'
  '{"name":"Coimbra-02","district":"Coimbra"}'
  '{"name":"Coimbra-03","district":"Coimbra"}'
  '{"name":"Aveiro-01","district":"Aveiro"}'
  '{"name":"Aveiro-02","district":"Aveiro"}'
  '{"name":"Aveiro-03","district":"Aveiro"}'
  '{"name":"Braga-01","district":"Braga"}'
  '{"name":"Braga-02","district":"Braga"}'
  '{"name":"Braga-03","district":"Braga"}'
  '{"name":"Leiria-01","district":"Leiria"}'
  '{"name":"Leiria-02","district":"Leiria"}'
  '{"name":"Leiria-03","district":"Leiria"}'
  '{"name":"Beja-01","district":"Beja"}'
  '{"name":"Beja-02","district":"Beja"}'
  '{"name":"Braganca-01","district":"Bragança"}'
  '{"name":"Braganca-02","district":"Bragança"}'
  '{"name":"Evora-01","district":"Évora"}'
  '{"name":"Evora-02","district":"Évora"}'
  '{"name":"Guarda-01","district":"Guarda"}'
  '{"name":"Guarda-02","district":"Guarda"}'
  '{"name":"Portalegre-01","district":"Portalegre"}'
  '{"name":"Portalegre-02","district":"Portalegre"}'
  '{"name":"Santarem-01","district":"Santarém"}'
  '{"name":"Santarem-02","district":"Santarém"}'
  '{"name":"Viana-01","district":"Viana do Castelo"}'
  '{"name":"Viana-02","district":"Viana do Castelo"}'
  '{"name":"Viseu-01","district":"Viseu"}'
  '{"name":"Viseu-02","district":"Viseu"}'
)

if [[ -n "$SENSORS_FILE" ]]; then
  if [[ ! -f "$SENSORS_FILE" ]]; then
    echo "error: $SENSORS_FILE not found" >&2
    exit 1
  fi
  if ! command -v jq >/dev/null 2>&1; then
    echo "error: jq is required to parse the JSON file (install with: sudo apt-get install -y jq)" >&2
    exit 1
  fi
  mapfile -t SENSORS < <(jq -c '.[]' "$SENSORS_FILE")
else
  SENSORS=("${DEFAULT_SENSORS[@]}")
fi

if [[ ${#SENSORS[@]} -eq 0 ]]; then
  echo "no sensors to seed"
  exit 0
fi

echo "Seeding ${#SENSORS[@]} sensor(s) into $OAM_BASE_URL ..."

CURL_AUTH=()
if [[ -n "$BEARER_TOKEN" ]]; then
  CURL_AUTH=(-H "Authorization: Bearer $BEARER_TOKEN")
fi

# Existing sensors — skip duplicates (idempotent).
existing_names=$(curl -ks "${CURL_AUTH[@]}" "$OAM_BASE_URL/sensors" \
  | python3 -c "import json,sys
try:
    d = json.load(sys.stdin)
    items = d if isinstance(d, list) else d.get('items', d.get('data', []))
    print('\n'.join(s.get('name','') for s in items))
except Exception:
    pass" 2>/dev/null || true)

created=0
skipped=0
failed=0

for sensor in "${SENSORS[@]}"; do
  name=$(echo "$sensor" | python3 -c "import json,sys; print(json.load(sys.stdin)['name'])")
  if echo "$existing_names" | grep -qx "$name"; then
    echo "  skip: $name (already exists)"
    skipped=$((skipped + 1))
    continue
  fi

  response=$(curl -ks -w "\n%{http_code}" -X POST "$OAM_BASE_URL/sensors" \
    -H "Content-Type: application/json" \
    "${CURL_AUTH[@]}" \
    -d "$sensor")
  status=$(echo "$response" | tail -n 1)
  body=$(echo "$response" | sed '$d')

  if [[ "$status" == "200" || "$status" == "201" ]]; then
    id=$(echo "$body" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id','?'))" 2>/dev/null || echo '?')
    echo "  ✓ $name  →  id=$id"
    created=$((created + 1))
  else
    echo "  ✗ $name  →  HTTP $status: $body"
    failed=$((failed + 1))
  fi
done

echo
echo "Done — created: $created, skipped: $skipped, failed: $failed"
exit $([ $failed -eq 0 ] && echo 0 || echo 1)
