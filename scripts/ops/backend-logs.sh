#!/usr/bin/env bash
# backend-logs.sh — capped log fetcher for the Hetzner backend (counterpart of
# fly-logs-tail.sh). Tees the full output to a file and prints only the last N
# lines so agents don't pay for the whole history.
#
# Usage: scripts/ops/backend-logs.sh <staging|production> [--lines N] [--since 15m]
#
# Connects with the read-only logs key ($BE_LOGS_SSH_KEY, default
# ~/.ssh/be_logs_ed25519), whose authorized_keys entry forces
# `/opt/border-empires/bin/deploy --logs-only`, so the only thing it can run is
# `logs <since>`. Host keys are pinned in deploy/known_hosts (strict checking;
# never trust-on-first-use). Host defaults to the documented servers and can be
# overridden with $BE_STAGING_HOST / $BE_PRODUCTION_HOST (user@host).
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
  staging) HOST="${BE_STAGING_HOST:-deploy@178.105.133.33}" ;;
  production) HOST="${BE_PRODUCTION_HOST:-deploy@188.245.240.42}" ;;
  *) echo "usage: $0 <staging|production> [--lines N] [--since 15m]" >&2; exit 2 ;;
esac
[[ "$SINCE" =~ ^[1-9][0-9]{0,3}[smh]$ ]] || { echo "error: --since must look like 30m, 6h or 90s" >&2; exit 2; }
[[ "$LINES" =~ ^[0-9]+$ ]] || { echo "error: --lines must be a number" >&2; exit 2; }

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
KNOWN_HOSTS="${REPO_ROOT}/deploy/known_hosts"
KEY="${BE_LOGS_SSH_KEY:-$HOME/.ssh/be_logs_ed25519}"
[[ -f "$KNOWN_HOSTS" ]] || { echo "error: missing pinned host keys at $KNOWN_HOSTS" >&2; exit 2; }
[[ -f "$KEY" ]] || { echo "error: logs key not found at $KEY (set BE_LOGS_SSH_KEY)" >&2; exit 2; }

FULL_LOG="/tmp/be-logs-${ENV_NAME}-$(date +%Y%m%d-%H%M%S).log"
ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=15 \
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$KNOWN_HOSTS" \
  "$HOST" "logs ${SINCE}" > "$FULL_LOG" 2>&1 || true
echo "# backend-logs: env=${ENV_NAME} since=${SINCE}, $(wc -l < "$FULL_LOG" | tr -d ' ') lines total, showing last ${LINES}"
echo "# full log: $FULL_LOG"
echo "# ---"
tail -n "$LINES" "$FULL_LOG"
