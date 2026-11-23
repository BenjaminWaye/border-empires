#!/usr/bin/env bash
# Runs launch-stack.mjs inside the production base image (node:22-alpine, musl
# allocator) with this checkout's built apps bind-mounted read-only, limited to
# the CPU and memory of the server being modelled. Local measurement only: it
# is the production base image and Node version, not the Dockerfile.combined
# build (no `pnpm prune --prod`, different user id).
#
# Requires the same builds as launch-stack.mjs and a running Docker daemon.
#
# Usage: run-stack-in-image.sh <run-dir> [KEY=VALUE ...]
#   <run-dir>   PROBE_DIR; also holds be.db and stack.log
#   KEY=VALUE   overrides applied on top of deploy/env/production.env, for
#               example SIMULATION_AI_PLAYER_COUNT=60 or, to age a world faster
#               than real time, PROBE_CLOCK_SCALE=8 (see clock-warp-preload.cjs)
# Stop it with `docker stop -t 60 <name>` for a graceful stop.
# Env:
#   PROBE_ENV_FILE   env file to start from (default deploy/env/production.env)
#   PROBE_CPUSET     cores to pin to (default 0,1 -- a CX23 has 2 vCPU)
#   PROBE_MEMORY     container memory limit (default 4g -- a CX23 has 4 GB)
#   PROBE_PORT_BASE  gateway port; simulation uses +1 and metrics +2 (default 13101)
#   PROBE_NAME       container name (default be-probe-<port>)
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
run_dir="${1:?usage: run-stack-in-image.sh <run-dir> [KEY=VALUE ...]}"
shift
mkdir -p "$run_dir"
run_dir="$(cd "$run_dir" && pwd)"
port="${PROBE_PORT_BASE:-13101}"
name="${PROBE_NAME:-be-probe-$port}"

grep -Ev '^(#|NODE_ENV=|HOST=|PLAY_ORIGIN=|GATEWAY_EMAIL_ALERTS_APP_URL=|NODE_OPTIONS=)' \
  "${PROBE_ENV_FILE:-$repo_root/deploy/env/production.env}" > "$run_dir/stack.env"
node_options="$(grep -E '^NODE_OPTIONS=' "${PROBE_ENV_FILE:-$repo_root/deploy/env/production.env}" | cut -d= -f2-)"

overrides=()
for pair in "$@"; do overrides+=(-e "$pair"); done

exec docker run --rm --name "$name" --network host --init --stop-timeout 60 \
  --cpuset-cpus "${PROBE_CPUSET:-0,1}" --memory "${PROBE_MEMORY:-4g}" \
  -v "$repo_root:$repo_root:ro" -v "$run_dir:$run_dir" -w "$repo_root" \
  --env-file "$run_dir/stack.env" \
  -e "NODE_OPTIONS=$node_options --require $repo_root/scripts/sector-memory-probe/clock-warp-preload.cjs --require $repo_root/scripts/sector-memory-probe/thread-heap-preload.cjs" \
  -e "PORT=$port" -e "SIMULATION_PORT=$((port + 1))" -e "SIMULATION_METRICS_PORT=$((port + 2))" \
  -e "SIMULATION_METRICS_HOST=127.0.0.1" -e "GATEWAY_SIMULATION_WAKE_ADDRESS=127.0.0.1:$((port + 1))" \
  -e "SIMULATION_SQLITE_PATH=$run_dir/be.db" -e "GATEWAY_SQLITE_PATH=$run_dir/be.db" -e "PROBE_DIR=$run_dir" \
  "${overrides[@]}" \
  node:22-alpine node scripts/sector-memory-probe/launch-stack.mjs
