#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

kill_match() {
  local pattern="$1"
  local pids
  pids="$(pgrep -f "${pattern}" || true)"
  if [[ -n "${pids}" ]]; then
    echo "Killing matching processes (${pattern}): ${pids}"
    kill -9 ${pids} 2>/dev/null || true
  fi
}

kill_match "tsx watch src/main.ts"
kill_match "node --import tsx src/main.ts"
kill_match "border-empires/packages/server/src/main.ts"
kill_match "border-empires/packages/server/dist/main.js"

pids="$(lsof -ti tcp:3001 -sTCP:LISTEN || true)"
if [[ -n "${pids}" ]]; then
  echo "Killing processes on port 3001: ${pids}"
  kill -9 ${pids} || true
fi

attempts=30
while (( attempts > 0 )); do
  if ! lsof -ti tcp:3001 -sTCP:LISTEN >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
  attempts=$((attempts - 1))
done

cd "${ROOT_DIR}"
pnpm --filter @border-empires/server dev
