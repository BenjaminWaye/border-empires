#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"

run_step() {
  local label="$1"
  shift

  printf '\n[%s]\n' "$label"
  "$@"
}

cd "$repo_root"

export CI=1
export PNPM_DISABLE_SELF_UPDATE_CHECK=1

printf '\n[install]\n'
if ! pnpm --filter @border-empires/shared exec tsc --version >/dev/null 2>&1; then
  printf 'Missing workspace TypeScript toolchain. Run `pnpm install --offline --frozen-lockfile` in this worktree first.\n' >&2
  exit 1
fi
if ! pnpm --filter @border-empires/client exec vitest --version >/dev/null 2>&1; then
  printf 'Missing workspace Vitest toolchain. Run `pnpm install --offline --frozen-lockfile` in this worktree first.\n' >&2
  exit 1
fi

run_step "shared:build" pnpm --filter @border-empires/shared build
run_step "scripts:test" pnpm test:scripts
run_step "shared:lint" pnpm --filter @border-empires/shared lint
run_step "shared:test" pnpm --filter @border-empires/shared test
run_step "game-domain:build" pnpm --filter @border-empires/game-domain build
run_step "game-domain:lint" pnpm --filter @border-empires/game-domain lint
run_step "game-domain:test" pnpm --filter @border-empires/game-domain test
run_step "client-protocol:build" pnpm --filter @border-empires/client-protocol build
run_step "client-protocol:lint" pnpm --filter @border-empires/client-protocol lint
run_step "client-protocol:test" pnpm --filter @border-empires/client-protocol test
run_step "sim-protocol:build" pnpm --filter @border-empires/sim-protocol build
run_step "sim-protocol:lint" pnpm --filter @border-empires/sim-protocol lint
run_step "sim-protocol:test" pnpm --filter @border-empires/sim-protocol test
run_step "simulation:lint" pnpm --filter @border-empires/simulation lint
run_step "simulation:test" pnpm --filter @border-empires/simulation test
run_step "simulation:build" pnpm --filter @border-empires/simulation build
run_step "realtime-gateway:lint" pnpm --filter @border-empires/realtime-gateway lint
run_step "realtime-gateway:test" pnpm --filter @border-empires/realtime-gateway test
run_step "realtime-gateway:build" pnpm --filter @border-empires/realtime-gateway build
run_step "client:changelog" pnpm check:client-changelog
run_step "client:lint" pnpm --filter @border-empires/client lint
run_step "client:test" pnpm --filter @border-empires/client test
run_step "client:build" pnpm --filter @border-empires/client build
