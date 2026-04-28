#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIRECT_DATABASE_URL="${DATABASE_URL:-${SIMULATION_DATABASE_URL:-${GATEWAY_DATABASE_URL:-}}}"

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
kill_match "pnpm --parallel --filter @border-empires/simulation --filter @border-empires/realtime-gateway --filter @border-empires/client dev"
kill_match "apps/simulation/node_modules/.bin/../tsx/dist/cli.mjs watch src/main.ts"
kill_match "apps/realtime-gateway/node_modules/.bin/../tsx/dist/cli.mjs watch src/main.ts"
kill_match "vite --host 0.0.0.0 --port 5173 --strictPort"
kill_match "border-empires/packages/client"

kill_port 50051
kill_port 3101
kill_port 5173
wait_port_free 50051
wait_port_free 3101
wait_port_free 5173

cd "${ROOT_DIR}"
if [[ -n "${DIRECT_DATABASE_URL}" ]] && [[ "${DIRECT_DATABASE_URL}" =~ @127\.0\.0\.1:|@localhost: ]]; then
  truncate_if_exists() {
    local table_name="$1"
    local exists
    exists="$(psql "${DIRECT_DATABASE_URL}" -Atqc "select to_regclass('public.${table_name}') is not null;")"
    if [[ "${exists}" == "t" ]]; then
      psql "${DIRECT_DATABASE_URL}" -q -c "TRUNCATE TABLE ${table_name} RESTART IDENTITY CASCADE;"
    fi
  }

  echo "Resetting local rewrite simulation tables before fresh seed startup"
  for table_name in \
    visibility_projection_current \
    combat_lock_projection_current \
    tile_projection_current \
    player_projection_current \
    visibility_projection \
    combat_lock_projection \
    tile_projection \
    player_projection \
    world_status_current \
    season_archive \
    checkpoint_metadata \
    world_snapshots \
    world_events \
    command_results \
    commands
  do
    truncate_if_exists "${table_name}"
  done
fi

if [[ -n "${DIRECT_DATABASE_URL}" ]]; then
  export DATABASE_URL="${DIRECT_DATABASE_URL}"
fi

SIMULATION_ALLOW_SEED_RECOVERY_FALLBACK=1 \
SIMULATION_REQUIRE_DURABLE_STARTUP_STATE=0 \
SIMULATION_SEED_PROFILE=season-20ai \
SIMULATION_ENABLE_AI_AUTOPILOT=1 \
SIMULATION_AI_TICK_MS=25 \
SIMULATION_ENABLE_SYSTEM_AUTOPILOT=1 \
SIMULATION_SYSTEM_PLAYER_IDS=barbarian-1 \
SIMULATION_SYSTEM_TICK_MS=100 \
pnpm dev
