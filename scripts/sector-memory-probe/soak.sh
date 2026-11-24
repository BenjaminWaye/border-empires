#!/usr/bin/env bash
# One command for a long 100-House run on a laptop or a spare server: starts the
# stack in the production base image (2 cores, 4 GB), plays 40 humans in turns
# (15-30 minutes on, about four hours away) against 60 AI Houses, and writes a
# summary when it ends. Local measurement only; it touches no live environment.
#
# Usage: scripts/sector-memory-probe/soak.sh [run-dir] [hours]
#   run-dir  where the world and the measurements go (default .local-data/soak)
#   hours    how long to run (default 72)
#
# Needs Docker running (Docker Desktop on a Mac, with at least 2 CPUs and 5 GB
# given to it) and `pnpm install` done in this checkout. Ctrl-C stops it
# cleanly. Running it again with the same run-dir carries on with the same
# world, so a sleep, a reboot or a crash costs only the time it was down.
# On a Mac it keeps the machine awake while it runs; keep it on mains power
# and do not close the lid.
#
# Any PROBE_* variable of late-contest-probe.mjs can be set in the environment,
# for example PROBE_REVEAL_AFTER_S=3600 to have one human reveal the map.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
run_dir="${1:-$repo_root/.local-data/soak}"
hours="${2:-72}"
name="${PROBE_NAME:-be-soak}"
mkdir -p "$run_dir"
run_dir="$(cd "$run_dir" && pwd)"

if [ "$(uname)" = Darwin ] && [ -z "${BE_SOAK_AWAKE:-}" ] && command -v caffeinate >/dev/null; then
  BE_SOAK_AWAKE=1 exec caffeinate -is "$0" "$run_dir" "$hours"
fi
docker version >/dev/null 2>&1 || { echo "Docker is not running." >&2; exit 1; }

cd "$repo_root"
if [ ! -f apps/simulation/dist/worker-main.js ] || [ ! -d apps/realtime-gateway/dist ] || [ "${PROBE_REBUILD:-0}" = 1 ]; then
  pnpm --filter "@border-empires/simulation..." --filter "@border-empires/realtime-gateway..." build
fi

stop() {
  trap - INT TERM EXIT
  echo "[soak] stopping the stack (final checkpoint)"
  docker stop -t 60 "$name" >/dev/null 2>&1 || true
  docker rm -f "$name" >/dev/null 2>&1 || true
  node scripts/sector-memory-probe/summarize-run.mjs "$run_dir" 60 > "$run_dir/summary.json" || true
  echo "[soak] summary: $run_dir/summary.json"
}
docker rm -f "$name" >/dev/null 2>&1 || true
trap stop INT TERM EXIT

echo "=== start $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >> "$run_dir/stack.log"
PROBE_DETACH=1 PROBE_NAME="$name" scripts/sector-memory-probe/run-stack-in-image.sh "$run_dir" \
  "SIMULATION_AI_PLAYER_COUNT=${PROBE_AI_HOUSES:-60}" \
  "PROBE_ADMIN_EMAIL=${PROBE_ADMIN_EMAIL:-probe-human-1@example.com}" >/dev/null
docker logs -t -f "$name" >> "$run_dir/stack.log" 2>&1 &

echo "[soak] waiting for the stack"
for _ in $(seq 180); do
  grep -q "probe-stack\] ready" <(docker logs "$name" 2>&1) && break
  docker inspect "$name" >/dev/null 2>&1 || { echo "[soak] the stack exited; see $run_dir/stack.log" >&2; exit 1; }
  sleep 2
done

echo "[soak] running for $hours hours; measurements in $run_dir"
passthrough=()
while IFS= read -r pair; do passthrough+=(-e "$pair"); done < <(env | grep -E '^PROBE_(HUMANS|SAMPLE_S|ACT_INTERVAL_MS|SESSION_MIN_S|SESSION_MAX_S|AWAY_S|RECONNECT_EVERY_S|REVEAL_AFTER_S|TAP_INTERVAL_MS)=' || true)
docker exec -e NODE_OPTIONS= -e "PROBE_DIR=$run_dir" \
  -e "PROBE_ADMIN_EMAIL=${PROBE_ADMIN_EMAIL:-probe-human-1@example.com}" \
  -e "PROBE_DURATION_S=$(awk "BEGIN{print int($hours*3600)}")" -e "PROBE_SAMPLE_S=${PROBE_SAMPLE_S:-60}" \
  ${passthrough[@]+"${passthrough[@]}"} \
  "$name" node scripts/sector-memory-probe/late-contest-probe.mjs
