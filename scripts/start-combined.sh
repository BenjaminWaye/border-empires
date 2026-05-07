#!/bin/sh
# Boots simulation and gateway in the same Fly machine.
# Either dying takes the machine down; Fly restart policy brings both back together.
set -eu

resolve_entry() {
  local app="$1"
  for candidate in \
    "apps/${app}/dist/main.js" \
    "apps/${app}/dist/${app}/src/main.js" \
    "apps/${app}/dist/apps/${app}/src/main.js" \
    "apps/${app}/dist/src/main.js"; do
    if [ -f "${candidate}" ]; then
      echo "${candidate}"
      return 0
    fi
  done
  echo "no dist entry found for ${app}" >&2
  find "apps/${app}/dist" -maxdepth 5 -type f >&2 || true
  return 1
}

SIM_ENTRY=$(resolve_entry simulation)
GATEWAY_ENTRY=$(resolve_entry realtime-gateway)

echo "[combined] starting simulation: ${SIM_ENTRY}"
node "${SIM_ENTRY}" &
SIM_PID=$!

# Give simulation a moment to bind its gRPC port before gateway tries to dial it.
# Gateway has its own retryStartup so this is just to reduce noise.
sleep 1

echo "[combined] starting gateway: ${GATEWAY_ENTRY}"
node "${GATEWAY_ENTRY}" &
GATEWAY_PID=$!

# Watch both children. If either exits, kill the other and propagate exit.
on_exit() {
  echo "[combined] shutting down (caught signal)"
  kill -TERM "${SIM_PID}" "${GATEWAY_PID}" 2>/dev/null || true
  wait "${SIM_PID}" "${GATEWAY_PID}" 2>/dev/null || true
  exit 0
}
trap on_exit INT TERM

while :; do
  if ! kill -0 "${SIM_PID}" 2>/dev/null; then
    echo "[combined] simulation pid ${SIM_PID} exited; tearing down gateway"
    kill -TERM "${GATEWAY_PID}" 2>/dev/null || true
    wait "${GATEWAY_PID}" 2>/dev/null || true
    exit 1
  fi
  if ! kill -0 "${GATEWAY_PID}" 2>/dev/null; then
    echo "[combined] gateway pid ${GATEWAY_PID} exited; tearing down simulation"
    kill -TERM "${SIM_PID}" 2>/dev/null || true
    wait "${SIM_PID}" 2>/dev/null || true
    exit 1
  fi
  sleep 2
done
