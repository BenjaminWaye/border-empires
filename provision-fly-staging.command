#!/bin/bash
# provision-fly-staging.command
# Bootstraps staging Fly apps for rewrite without provisioning Fly Postgres.
#
# Prerequisites:
#   - flyctl installed and authenticated (fly auth login)
#   - Owner or Admin access on the Fly org
#   - A Supabase staging database URL with sslmode=require
#
# Usage:
#   export STAGING_DATABASE_URL="postgres://...sslmode=require"
#   ./provision-fly-staging.command

set -euo pipefail
cd /Users/benjaminwaye/Sites/border-empires-container/border-empires

if [ -z "${STAGING_DATABASE_URL:-}" ]; then
  echo "ERROR: STAGING_DATABASE_URL is required."
  echo "Example:"
  echo "  export STAGING_DATABASE_URL=\"postgres://...sslmode=require\""
  exit 1
fi

echo ""
echo "=== Creating staging Fly apps (if needed) ==="

if fly apps list 2>/dev/null | grep -q "border-empires-gateway-staging"; then
  echo "✓ border-empires-gateway-staging already exists"
else
  fly apps create border-empires-gateway-staging
fi

if fly apps list 2>/dev/null | grep -q "border-empires-simulation-staging"; then
  echo "✓ border-empires-simulation-staging already exists"
else
  fly apps create border-empires-simulation-staging
fi

echo ""
echo "=== Setting staging secrets ==="
fly secrets set DATABASE_URL="${STAGING_DATABASE_URL}" --app border-empires-gateway-staging
fly secrets set DATABASE_URL="${STAGING_DATABASE_URL}" --app border-empires-simulation-staging
fly secrets set SIMULATION_ADDRESS="border-empires-simulation-staging.flycast:50051" --app border-empires-gateway-staging

echo ""
echo "=== Applying migrations to staging database ==="
DATABASE_URL="${STAGING_DATABASE_URL}" pnpm rewrite:db:migrate

echo ""
echo "✓ Staging apps and Supabase wiring are ready."
echo ""
echo "Next steps:"
echo "  fly deploy --config fly.simulation.staging.toml"
echo "  fly deploy --config fly.gateway.staging.toml"
