#!/usr/bin/env bash
# backend-logs.sh — capped log fetcher for the Hetzner backend (counterpart of
# fly-logs-tail.sh). Tees the full output to a file and prints only the last N
# lines so agents don't pay for the whole history.
#
# Usage: scripts/ops/backend-logs.sh <staging|production> [--lines N] [--since 15m]
# Host comes from $BE_STAGING_HOST / $BE_PRODUCTION_HOST (e.g. deploy@203.0.113.7).
set -euo pipefail

ENV_NAME="${1:-}"; shift || true
LINES=200
SINCE=15m
while [[ $# -gt 0 ]]; do
  case "$1" in
    --lines) LINES="$2"; shift 2 ;;
    --since) SINCE="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

case "$ENV_NAME" in
  staging) HOST="${BE_STAGING_HOST:-}" ;;
  production) HOST="${BE_PRODUCTION_HOST:-}" ;;
  *) echo "usage: $0 <staging|production> [--lines N] [--since 15m]" >&2; exit 2 ;;
esac
[[ -n "$HOST" ]] || { echo "error: set BE_${ENV_NAME^^}_HOST (user@host)" >&2; exit 2; }

FULL_LOG="/tmp/be-logs-${ENV_NAME}-$(date +%Y%m%d-%H%M%S).log"
ssh "$HOST" "cd /opt/border-empires && docker compose logs --no-color --since ${SINCE} app" > "$FULL_LOG" 2>&1 || true
echo "# backend-logs: env=${ENV_NAME} since=${SINCE}, $(wc -l < "$FULL_LOG" | tr -d ' ') lines total, showing last ${LINES}"
echo "# full log: $FULL_LOG"
echo "# ---"
tail -n "$LINES" "$FULL_LOG"
