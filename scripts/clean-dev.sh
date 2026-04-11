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

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:"${port}" -sTCP:LISTEN || true)"
  if [[ -n "${pids}" ]]; then
    echo "Killing processes on port ${port}: ${pids}"
    kill -9 ${pids} || true
  fi
}

wait_port_free() {
  local port="$1"
  local attempts=30
  while (( attempts > 0 )); do
    if ! lsof -ti tcp:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.2
    attempts=$((attempts - 1))
  done
  echo "Port ${port} is still busy after waiting."
  return 1
}

# Kill known stale watchers first, then listeners.
kill_match "tsx watch src/main.ts"
kill_match "node --import tsx src/main.ts"
kill_match "border-empires/packages/server/src/main.ts"
kill_match "border-empires/packages/server/dist/main.js"
kill_match "vite --host 0.0.0.0 --port 5173 --strictPort"
kill_match "border-empires/packages/client"

kill_port 3001
kill_port 5173
wait_port_free 3001
wait_port_free 5173

cd "${ROOT_DIR}"
pnpm dev
