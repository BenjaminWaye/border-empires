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
run_step "shared:lint" pnpm --filter @border-empires/shared lint
run_step "shared:test" pnpm --filter @border-empires/shared test
run_step "server:lint" pnpm --filter @border-empires/server lint
run_step "server:test" pnpm --filter @border-empires/server test
run_step "client:changelog" pnpm check:client-changelog
run_step "client:lint" pnpm --filter @border-empires/client lint
run_step "client:test" pnpm --filter @border-empires/client test
run_step "server:build" pnpm --filter @border-empires/server build
run_step "client:build" pnpm --filter @border-empires/client build
