#!/usr/bin/env bash
# Adds VoltGuard local dev subdomain entries to /etc/hosts.
# Run once per machine: sudo ./scripts/add-hosts.sh
set -euo pipefail

HOSTS=(
  "composer.voltguard.pt"
  "oam.voltguard.pt"
  "notifications.voltguard.pt"
  "anomaly.voltguard.pt"
)

ADDED=0
for HOST in "${HOSTS[@]}"; do
  if grep -q "$HOST" /etc/hosts 2>/dev/null; then
    echo "  already present: $HOST"
  else
    echo "127.0.0.1  $HOST" | sudo tee -a /etc/hosts > /dev/null
    echo "  added: $HOST"
    ADDED=$((ADDED + 1))
  fi
done

if [[ $ADDED -gt 0 ]]; then
  echo "Done — $ADDED entr$([ $ADDED -eq 1 ] && echo y || echo ies) added to /etc/hosts."
else
  echo "Done — all entries were already present."
fi
