#!/bin/bash
# provision-fly-prod.command
# Double-click this in Finder to provision the production Postgres database and
# attach it to the production Fly apps (border-empires-gateway and border-empires-simulation).
#
# Cost impact: ~$0 additional — uses the EXISTING shared border-empires-postgres cluster
# with a new logical database. Cluster cost (~$3.44/mo) is already accounted for in
# the staging provisioning. Total Fly budget stays under $10/mo.
#
# Prerequisites:
#   - flyctl installed and authenticated (fly auth login)
#   - You have Owner or Admin access on the border-empires Fly org
#   - border-empires-postgres cluster already exists (run provision-fly-staging.command first)
#   - PROD_DB_PASSWORD env var set to a strong randomly-generated password (never a placeholder)
#
# Generate a strong password:
#   export PROD_DB_PASSWORD="$(openssl rand -base64 32)"
#   Store it in 1Password under "Border Empires / be_prod Postgres" before running.
#
# Run this ONCE during Phase 6 pre-flight. Do NOT run it again — the database persists.

set -e
cd /Users/benjaminwaye/Sites/border-empires-container/border-empires

echo ""
echo "=== border-empires production Postgres provisioning ==="
echo ""

# Safety check: refuse to run with a placeholder password.
PROD_PASSWORD="${PROD_DB_PASSWORD:-}"
if [ -z "$PROD_PASSWORD" ]; then
  echo "ERROR: PROD_DB_PASSWORD must be set to a strong password before running."
  echo ""
  echo "  export PROD_DB_PASSWORD=\"\$(openssl rand -base64 32)\""
  echo "  # Store the generated value in 1Password, then re-run."
  exit 1
fi

# Sanity check: cluster must exist already.
if ! fly postgres list 2>/dev/null | grep -q "border-empires-postgres"; then
  echo "ERROR: border-empires-postgres cluster not found."
  echo "Run provision-fly-staging.command first to create the cluster."
  exit 1
fi
echo "✓ border-empires-postgres cluster confirmed"

echo ""
echo "=== Creating production database and role ==="

# Create border_empires_prod database and be_prod role on the shared cluster.
fly postgres connect -a border-empires-postgres << SQL
-- Create the production database (idempotent: no-op if already exists)
SELECT 'CREATE DATABASE border_empires_prod'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'border_empires_prod') \gexec

-- Create the production role (idempotent: no-op if already exists)
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'be_prod') THEN
    CREATE ROLE be_prod LOGIN PASSWORD '${PROD_PASSWORD}';
  END IF;
END
\$\$;

GRANT ALL PRIVILEGES ON DATABASE border_empires_prod TO be_prod;
SQL

echo "✓ border_empires_prod database and be_prod role created"

echo ""
echo "=== Attaching Postgres to production apps ==="
echo "(This sets DATABASE_URL as a Fly secret on each app automatically)"

fly postgres attach border-empires-postgres \
  --app border-empires-gateway \
  --database-name border_empires_prod \
  --variable-name DATABASE_URL 2>/dev/null || echo "(attachment may already exist on gateway)"

fly postgres attach border-empires-postgres \
  --app border-empires-simulation \
  --database-name border_empires_prod \
  --variable-name DATABASE_URL 2>/dev/null || echo "(attachment may already exist on simulation)"

echo ""
echo "=== Running migrations ==="
echo "Run migrations manually against border_empires_prod using fly ssh console:"
echo ""
echo "  fly ssh console --app border-empires-simulation"
echo "  # Then inside the console:"
echo "  pnpm -C /app exec tsx apps/simulation/src/run-migrations.ts"
echo ""
echo "Or pipe migration files directly:"
echo "  fly postgres connect -a border-empires-postgres --database border_empires_prod < apps/simulation/sql/0001_world_events.sql"
echo "  fly postgres connect -a border-empires-postgres --database border_empires_prod < apps/simulation/sql/0002_command_store.sql"
echo "  fly postgres connect -a border-empires-postgres --database border_empires_prod < apps/simulation/sql/0003_world_snapshots.sql"
echo "  fly postgres connect -a border-empires-postgres --database border_empires_prod < apps/simulation/sql/0004_player_projection.sql"
echo "  fly postgres connect -a border-empires-postgres --database border_empires_prod < apps/simulation/sql/0005_tile_projection.sql"
echo "  fly postgres connect -a border-empires-postgres --database border_empires_prod < apps/simulation/sql/0006_combat_lock_projection.sql"
echo "  fly postgres connect -a border-empires-postgres --database border_empires_prod < apps/simulation/sql/0007_visibility_projection.sql"
echo "  fly postgres connect -a border-empires-postgres --database border_empires_prod < apps/realtime-gateway/sql/0001_command_store.sql"

echo ""
echo "=== Setting NODE_ENV and tuning secrets on production apps ==="

fly secrets set \
  NODE_ENV="production" \
  SIMULATION_SNAPSHOT_EVERY_EVENTS="5000" \
  SIMULATION_CHECKPOINT_MAX_RSS_MB="260" \
  --app border-empires-simulation

fly secrets set \
  NODE_ENV="production" \
  SIMULATION_ADDRESS="border-empires-simulation.flycast:50051" \
  --app border-empires-gateway

echo ""
echo "✓ Production Postgres provisioning complete."
echo ""
echo "Phase 6 next steps:"
echo "  1. Run migrations against border_empires_prod (see commands above)."
echo "  2. Import the production data snapshot:"
echo "     node scripts/rewrite-db-import-legacy-snapshot.ts --env production"
echo "  3. fly deploy --config fly.simulation.toml"
echo "  4. fly deploy --config fly.gateway.toml"
echo "  5. Verify /healthz on both apps returns runtime provenance."
echo "  6. Run the 5-minute pre-cutover load harness against prod."
echo ""
echo "See docs/rewrite-pg-restore-runbook.md for backup and restore procedures."
echo ""
echo "Done. You can close this window."
