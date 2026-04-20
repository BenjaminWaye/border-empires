#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PROXY_PORT="${DB_PROXY_PORT:-15432}"
DB_PROXY_APP="${DB_PROXY_APP:-border-empires-rewrite-db}"
DB_USER="${DB_USER:-rewrite_proof}"
DB_PASSWORD="${DB_PASSWORD:-rewrite_proof_pw}"
DB_NAME="${DB_NAME:-rewrite_local_20ai}"
DB_APPLY_SCHEMA="${DB_APPLY_SCHEMA:-1}"

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

kill_match "border-empires/apps/simulation/src/main.ts"
kill_match "border-empires/apps/realtime-gateway/src/main.ts"
kill_match "border-empires/apps/simulation/dist/apps/simulation/src/main.js"
kill_match "border-empires/apps/realtime-gateway/dist/apps/realtime-gateway/src/main.js"
kill_match "vite --host 0.0.0.0 --port 5173 --strictPort"
kill_match "border-empires/packages/client"
kill_match "fly proxy ${DB_PROXY_PORT}:5432 -a ${DB_PROXY_APP}"

kill_port 50051
kill_port 3101
kill_port 5173
kill_port "${DB_PROXY_PORT}"
wait_port_free 50051
wait_port_free 3101
wait_port_free 5173
wait_port_free "${DB_PROXY_PORT}"

cleanup() {
  if [[ -n "${proxy_pid:-}" ]]; then
    kill "${proxy_pid}" 2>/dev/null || true
  fi
}

trap cleanup EXIT

cd "${ROOT_DIR}"

echo "Starting Fly Postgres proxy on localhost:${DB_PROXY_PORT} for ${DB_PROXY_APP}"
fly proxy "${DB_PROXY_PORT}:5432" -a "${DB_PROXY_APP}" >/tmp/border-empires-rewrite-db-proxy.log 2>&1 &
proxy_pid=$!

proxy_attempts=50
while (( proxy_attempts > 0 )); do
  if lsof -ti tcp:"${DB_PROXY_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "${proxy_pid}" 2>/dev/null; then
    echo "Fly Postgres proxy exited early."
    cat /tmp/border-empires-rewrite-db-proxy.log
    exit 1
  fi
  sleep 0.2
  proxy_attempts=$((proxy_attempts - 1))
done

if (( proxy_attempts == 0 )); then
  echo "Timed out waiting for Fly Postgres proxy on port ${DB_PROXY_PORT}."
  cat /tmp/border-empires-rewrite-db-proxy.log
  exit 1
fi

DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${DB_PROXY_PORT}/${DB_NAME}?sslmode=disable"

echo "Booting durable rewrite localhost stack against ${DB_NAME}"
GATEWAY_DATABASE_URL="${DATABASE_URL}" \
GATEWAY_DB_APPLY_SCHEMA="${DB_APPLY_SCHEMA}" \
SIMULATION_DATABASE_URL="${DATABASE_URL}" \
SIMULATION_DB_APPLY_SCHEMA="${DB_APPLY_SCHEMA}" \
SIMULATION_SEED_PROFILE=season-20ai \
SIMULATION_ENABLE_AI_AUTOPILOT=1 \
SIMULATION_AI_TICK_MS=25 \
SIMULATION_ENABLE_SYSTEM_AUTOPILOT=1 \
SIMULATION_SYSTEM_PLAYER_IDS=barbarian-1 \
SIMULATION_SYSTEM_TICK_MS=100 \
pnpm dev
