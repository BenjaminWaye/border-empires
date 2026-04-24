#!/usr/bin/env bash
# provision-fly-prod.command
# Double-click this in Finder (or run with bash) to apply all production
# database migrations to Supabase and set secrets on the production Fly apps.
#
# Cost impact: $0 additional — uses Supabase free tier ($0/mo).
# Supabase limits: 500MB ceiling, 7-day inactivity auto-pause, 7-day PITR.
#
# Prerequisites:
#   - psql installed locally (brew install libpq / apt install postgresql-client)
#   - SUPABASE_DB_URL env var set to the Supabase direct/session-mode pooler URL
#     (port 5432, NOT 6543) WITH sslmode=require
#     e.g. postgres://postgres.xxxx:PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
#   - OR a .env.production file in the repo root with SUPABASE_DB_URL=... (gitignored)
#   - flyctl installed and authenticated (fly auth login) for setting Fly secrets
#
# Run with --dry-run to print commands without executing:
#   bash provision-fly-prod.command --dry-run
#
# This script is IDEMPOTENT: it can be re-run safely — migrations that have
# already been applied will be skipped (checked via pg_class / pg_tables queries).
#
# Run this ONCE during Phase 6 pre-flight, then again for any new migrations.

set -euo pipefail

# ---------------------------------------------------------------------------
# Path resolution — works from any checkout location
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

# ---------------------------------------------------------------------------
# Parse flags
# ---------------------------------------------------------------------------
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

if [ "${DRY_RUN}" = "1" ]; then
  echo ""
  echo "=== DRY RUN — no commands will be executed ==="
  echo ""
fi

run() {
  if [ "${DRY_RUN}" = "1" ]; then
    echo "  [dry-run] $*"
  else
    "$@"
  fi
}

psql_run() {
  local label="$1"
  local file="$2"
  if [ "${DRY_RUN}" = "1" ]; then
    echo "  [dry-run] psql \$SUPABASE_DB_URL -f ${file}  # ${label}"
  else
    echo "[$(date -u)] Applying: ${label} (${file})"
    psql "${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 -f "${file}"
    echo "[$(date -u)] ✓ ${label}"
  fi
}

# ---------------------------------------------------------------------------
# Dependency checks
# ---------------------------------------------------------------------------
if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql is not installed."
  echo ""
  echo "  macOS:  brew install libpq && brew link libpq --force"
  echo "  Ubuntu: sudo apt-get install -y postgresql-client"
  exit 1
fi

# ---------------------------------------------------------------------------
# Source SUPABASE_DB_URL
# ---------------------------------------------------------------------------
# Check env var first, then .env.production file (which MUST be gitignored)
if [ -z "${SUPABASE_DB_URL:-}" ]; then
  if [ -f "${SCRIPT_DIR}/.env.production" ]; then
    # shellcheck source=/dev/null
    set -a
    source "${SCRIPT_DIR}/.env.production"
    set +a
    echo "Loaded SUPABASE_DB_URL from .env.production"
  fi
fi

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "ERROR: SUPABASE_DB_URL is not set."
  echo ""
  echo "Set it as an env var:"
  echo "  export SUPABASE_DB_URL='postgres://postgres.xxxx:PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require'"
  echo ""
  echo "Or create .env.production in the repo root (it is gitignored):"
  echo "  echo 'SUPABASE_DB_URL=postgres://...' > .env.production"
  echo ""
  echo "IMPORTANT: Use port 5432 (direct or session-mode pooler), NOT 6543."
  echo "           The URL must include ?sslmode=require."
  exit 1
fi

# Validate the URL
if [[ "${SUPABASE_DB_URL}" != *"sslmode=require"* ]]; then
  echo "ERROR: SUPABASE_DB_URL must include sslmode=require."
  echo "  Append ?sslmode=require (or &sslmode=require) to your URL."
  exit 1
fi
if [[ "${SUPABASE_DB_URL}" == *":6543"* ]]; then
  echo "ERROR: SUPABASE_DB_URL uses port 6543 (transaction-mode pooler)."
  echo "  Switch to port 5432 (direct connection or session-mode pooler)."
  echo "  The transaction-mode pooler breaks multi-statement migrations."
  exit 1
fi

echo ""
echo "=== border-empires production Supabase provisioning ==="
echo "Database: ${SUPABASE_DB_URL%%@*}@...  (credentials redacted)"
echo ""

# ---------------------------------------------------------------------------
# Verify .gitignore covers .env.production
# ---------------------------------------------------------------------------
if [ -f "${SCRIPT_DIR}/.env.production" ]; then
  if ! grep -q "\.env\.production" "${SCRIPT_DIR}/.gitignore" 2>/dev/null; then
    echo "ERROR: .env.production exists but is NOT in .gitignore!"
    echo "  Add '.env.production' to .gitignore before proceeding."
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Helper: check if a table exists in Supabase
# ---------------------------------------------------------------------------
table_exists() {
  local tbl="$1"
  psql "${SUPABASE_DB_URL}" -tAc \
    "SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='${tbl}' LIMIT 1;" \
    2>/dev/null | grep -q "1"
}

# ---------------------------------------------------------------------------
# Simulation migrations (0001–0008)
# ---------------------------------------------------------------------------
echo "=== Simulation migrations ==="

# 0001_world_events — anchor table
if table_exists "world_events"; then
  echo "  [skip] 0001_world_events — world_events table already exists"
else
  psql_run "0001_world_events" "apps/simulation/sql/0001_world_events.sql"
fi

# 0002_command_store
if table_exists "command_store"; then
  echo "  [skip] 0002_command_store — command_store table already exists"
else
  psql_run "0002_command_store" "apps/simulation/sql/0002_command_store.sql"
fi

# 0003_world_snapshots
if table_exists "world_snapshots"; then
  echo "  [skip] 0003_world_snapshots — world_snapshots table already exists"
else
  psql_run "0003_world_snapshots" "apps/simulation/sql/0003_world_snapshots.sql"
fi

# 0004_player_projection
if table_exists "player_projection"; then
  echo "  [skip] 0004_player_projection — player_projection table already exists"
else
  psql_run "0004_player_projection" "apps/simulation/sql/0004_player_projection.sql"
fi

# 0005_tile_projection
if table_exists "tile_projection"; then
  echo "  [skip] 0005_tile_projection — tile_projection table already exists"
else
  psql_run "0005_tile_projection" "apps/simulation/sql/0005_tile_projection.sql"
fi

# 0006_combat_lock_projection
if table_exists "combat_lock_projection"; then
  echo "  [skip] 0006_combat_lock_projection — combat_lock_projection table already exists"
else
  psql_run "0006_combat_lock_projection" "apps/simulation/sql/0006_combat_lock_projection.sql"
fi

# 0007_visibility_projection
if table_exists "visibility_projection"; then
  echo "  [skip] 0007_visibility_projection — visibility_projection table already exists"
else
  psql_run "0007_visibility_projection" "apps/simulation/sql/0007_visibility_projection.sql"
fi

# 0008_bounded_storage — checkpoint_metadata, season_archive, *_current projections
# Critical for Supabase free-tier compaction (500MB ceiling)
if table_exists "checkpoint_metadata"; then
  echo "  [skip] 0008_bounded_storage — checkpoint_metadata table already exists"
else
  psql_run "0008_bounded_storage" "apps/simulation/sql/0008_bounded_storage.sql"
fi

# ---------------------------------------------------------------------------
# Gateway migrations
# ---------------------------------------------------------------------------
echo ""
echo "=== Gateway migrations ==="

# gateway/0001_command_store
if psql "${SUPABASE_DB_URL}" -tAc \
    "SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='gateway_command_store' LIMIT 1;" \
    2>/dev/null | grep -q "1"; then
  echo "  [skip] gateway/0001_command_store — gateway_command_store table already exists"
else
  psql_run "gateway/0001_command_store" "apps/realtime-gateway/sql/0001_command_store.sql"
fi

# ---------------------------------------------------------------------------
# Fly secrets (NODE_ENV + tunables)
# ---------------------------------------------------------------------------
echo ""
echo "=== Fly secrets ==="

if command -v fly >/dev/null 2>&1; then
  run fly secrets set \
    NODE_ENV="production" \
    SIMULATION_SNAPSHOT_EVERY_EVENTS="5000" \
    SIMULATION_CHECKPOINT_MAX_RSS_MB="260" \
    --app border-empires-simulation

  run fly secrets set \
    NODE_ENV="production" \
    SIMULATION_ADDRESS="border-empires-simulation.flycast:50051" \
    --app border-empires-gateway
else
  echo "  [warn] flyctl not found — skipping Fly secrets. Set them manually:"
  echo "    fly secrets set NODE_ENV=production SIMULATION_SNAPSHOT_EVERY_EVENTS=5000 SIMULATION_CHECKPOINT_MAX_RSS_MB=260 --app border-empires-simulation"
  echo "    fly secrets set NODE_ENV=production SIMULATION_ADDRESS=border-empires-simulation.flycast:50051 --app border-empires-gateway"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
if [ "${DRY_RUN}" = "1" ]; then
  echo "=== DRY RUN complete — no changes were made ==="
else
  echo "✓ Production Supabase provisioning complete."
fi
echo ""
echo "Phase 6 next steps:"
echo "  1. Verify DB size is under 400MB:"
echo "     psql \$SUPABASE_DB_URL -c \"SELECT pg_size_pretty(pg_database_size(current_database()));\""
echo "  2. Import production data snapshot:"
echo "     node scripts/rewrite-db-import-legacy-snapshot.ts --env production"
echo "  3. fly deploy --config fly.simulation.toml"
echo "  4. fly deploy --config fly.gateway.toml"
echo "  5. Verify /healthz on both apps returns runtime provenance."
echo "  6. Run the 5-minute pre-cutover load harness against prod."
echo ""
echo "See docs/rewrite-supabase-cutover-runbook.md for the full operational runbook."
echo ""
echo "Done. You can close this window."
