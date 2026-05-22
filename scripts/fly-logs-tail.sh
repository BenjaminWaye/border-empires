#!/usr/bin/env bash
# fly-logs-tail.sh — capped Fly log fetcher for agent use.
#
# Why: `flyctl logs` streams thousands of lines and dumping the full output into
# an agent's context costs hundreds of thousands of tokens. This wrapper tees
# the full output to a file and prints only the last N lines, so the agent gets
# the recent signal without paying for the whole history. Use Read with offset
# on the saved file when older lines are needed.
#
# Usage:
#   scripts/fly-logs-tail.sh -a <app> [--lines N] [--seconds S] [-- <extra flyctl args>]
#
# Examples:
#   scripts/fly-logs-tail.sh -a border-empires-combined-staging
#   scripts/fly-logs-tail.sh -a border-empires --lines 100 --seconds 30
#   scripts/fly-logs-tail.sh -a border-empires -- --region iad
#
# Full output is written to /tmp/fly-logs-<app>-<timestamp>.log and the path is
# echoed on the last line of stdout so callers can grep deeper if needed.

set -euo pipefail

APP=""
LINES=200
SECONDS_TO_CAPTURE=15
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -a|--app)
      APP="$2"; shift 2 ;;
    --lines)
      LINES="$2"; shift 2 ;;
    --seconds)
      SECONDS_TO_CAPTURE="$2"; shift 2 ;;
    --)
      shift; EXTRA_ARGS=("$@"); break ;;
    -h|--help)
      sed -n '2,18p' "$0"; exit 0 ;;
    *)
      echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$APP" ]]; then
  echo "error: -a <app> is required" >&2
  exit 2
fi

if ! command -v flyctl >/dev/null 2>&1 && ! command -v fly >/dev/null 2>&1; then
  echo "error: neither flyctl nor fly is on PATH" >&2
  exit 127
fi

FLY_BIN="$(command -v flyctl || command -v fly)"
TS="$(date +%Y%m%d-%H%M%S)"
FULL_LOG="/tmp/fly-logs-${APP}-${TS}.log"

# Run flyctl logs for the requested window, capture full output, then truncate.
# We background flyctl, sleep, and SIGTERM it — flyctl logs has no native --duration flag.
set +e
"$FLY_BIN" logs -a "$APP" ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"} > "$FULL_LOG" 2>&1 &
FLY_PID=$!
sleep "$SECONDS_TO_CAPTURE"
kill -TERM "$FLY_PID" 2>/dev/null || true
wait "$FLY_PID" 2>/dev/null
set -e

TOTAL_LINES=$(wc -l < "$FULL_LOG" | tr -d ' ')
echo "# fly-logs-tail: app=$APP captured ${SECONDS_TO_CAPTURE}s, ${TOTAL_LINES} lines total, showing last ${LINES}"
echo "# full log: $FULL_LOG"
echo "# ---"
tail -n "$LINES" "$FULL_LOG"
