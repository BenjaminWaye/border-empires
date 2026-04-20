#!/usr/bin/env bash
# CI guard: apps/* must not contain relative imports into packages/server.
# Usage: scripts/check-no-cross-package-imports.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if grep -r "packages/server" \
    "$ROOT/apps/simulation/src" \
    "$ROOT/apps/realtime-gateway/src" \
    --include="*.ts" \
    --quiet; then
  echo "ERROR: Cross-package imports from packages/server found in apps/" >&2
  grep -r "packages/server" \
    "$ROOT/apps/simulation/src" \
    "$ROOT/apps/realtime-gateway/src" \
    --include="*.ts" >&2
  exit 1
fi

echo "OK: No cross-package imports from packages/server in apps/"
