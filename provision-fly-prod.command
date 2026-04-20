#!/bin/bash
# provision-fly-prod.command
# One-shot Phase 6 preflight provisioning for production rewrite cutover.
#
# Prerequisites:
#   - flyctl installed and authenticated (fly auth login)
#   - Owner/Admin access on Fly org
#   - Existing cluster app: border-empires-postgres
#
# This script intentionally refuses placeholder passwords.

set -euo pipefail
cd /Users/benjaminwaye/Sites/border-empires-container/border-empires

echo ""
echo "=== Phase 6 prod provisioning (rewrite stack, no traffic yet) ==="
echo ""

if ! fly postgres list 2>/dev/null | grep -q "border-empires-postgres"; then
  echo "ERROR: expected existing cluster app border-empires-postgres not found"
  exit 1
fi

if fly apps list 2>/dev/null | grep -q "border-empires-gateway"; then
  echo "✓ border-empires-gateway app exists"
else
  fly apps create border-empires-gateway
fi

if fly apps list 2>/dev/null | grep -q "border-empires-simulation"; then
  echo "✓ border-empires-simulation app exists"
else
  fly apps create border-empires-simulation
fi

echo ""
echo "Enter a strong password for Postgres role be_prod (input hidden):"
read -r -s BE_PROD_PASSWORD
echo ""

if [ -z "${BE_PROD_PASSWORD}" ]; then
  echo "ERROR: password cannot be empty"
  exit 1
fi

case "${BE_PROD_PASSWORD}" in
  *changeme*|*CHANGE_ME*|*password*|*placeholder*|*example*)
    echo "ERROR: placeholder-like password rejected"
    exit 1
    ;;
esac

BE_PROD_PASSWORD_SQL=${BE_PROD_PASSWORD//\'/\'\'}

echo ""
echo "=== Ensuring border_empires_prod database + be_prod role ==="
cat <<SQL | fly postgres connect -a border-empires-postgres
DO
\$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'be_prod') THEN
    CREATE ROLE be_prod LOGIN PASSWORD '${BE_PROD_PASSWORD_SQL}';
  ELSE
    ALTER ROLE be_prod WITH PASSWORD '${BE_PROD_PASSWORD_SQL}';
  END IF;
END
\$\$;
SQL

cat <<'SQL' | fly postgres connect -a border-empires-postgres
SELECT 'CREATE DATABASE border_empires_prod'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'border_empires_prod')
\gexec
SQL

cat <<SQL | fly postgres connect -a border-empires-postgres
GRANT ALL PRIVILEGES ON DATABASE border_empires_prod TO be_prod;
SQL

echo ""
echo "=== Attaching Postgres DATABASE_URL to prod apps ==="
fly postgres attach border-empires-postgres \
  --app border-empires-gateway \
  --database-name border_empires_prod \
  --variable-name DATABASE_URL 2>/dev/null || echo "(gateway attach may already exist)"

fly postgres attach border-empires-postgres \
  --app border-empires-simulation \
  --database-name border_empires_prod \
  --variable-name DATABASE_URL 2>/dev/null || echo "(simulation attach may already exist)"

echo ""
echo "=== Setting gateway simulation address secret ==="
fly secrets set \
  SIMULATION_ADDRESS="border-empires-simulation.flycast:50051" \
  --app border-empires-gateway

echo ""
echo "✓ Phase 6 prod provisioning complete."
echo ""
echo "Next steps:"
echo "  1. Apply prod migrations (simulation + gateway command store SQL)."
echo "  2. Deploy: fly deploy --config fly.simulation.toml && fly deploy --config fly.gateway.toml"
echo "  3. Verify /healthz provenance and run scripts/rewrite-phase6-cutover-check.mjs"
