#!/bin/bash
# provision-fly-staging.command
# Double-click this in Finder to provision the Fly Postgres cluster and
# staging apps for border-empires.
#
# Prerequisites:
#   - flyctl installed and authenticated (fly auth login)
#   - You have Owner or Admin access on the border-empires Fly org
#
# Run this ONCE. After it completes:
#   1. Copy the DATABASE_URL printed at the end.
#   2. Set the secret on both staging apps (the commands are printed for you).
#   3. Deploy the staging apps with push-phase2.command.

set -e
cd /Users/benjaminwaye/Sites/border-empires-container/border-empires

echo ""
echo "=== Provisioning border-empires Fly Postgres cluster ==="
echo ""

# Create a shared Postgres cluster (if not already present)
if fly postgres list 2>/dev/null | grep -q "border-empires-postgres"; then
  echo "✓ border-empires-postgres cluster already exists"
else
  fly postgres create \
    --name border-empires-postgres \
    --region arn \
    --initial-cluster-size 1 \
    --vm-size shared-cpu-1x \
    --volume-size 10
fi

echo ""
echo "=== Creating staging databases ==="

# Create staging database and role.
# IMPORTANT: Replace <STAGING_PASSWORD> with a strong random password before running.
# Generate one with: openssl rand -base64 32
# Store in 1Password under "Border Empires / be_staging Postgres".
# Do NOT commit the real password to the repo.
STAGING_PASSWORD="${STAGING_DB_PASSWORD:-}"
if [ -z "$STAGING_PASSWORD" ]; then
  echo ""
  echo "ERROR: Set STAGING_DB_PASSWORD env var to a strong password before running."
  echo "  export STAGING_DB_PASSWORD=\"\$(openssl rand -base64 32)\""
  echo "Then re-run this script."
  exit 1
fi

fly postgres connect -a border-empires-postgres << SQL
CREATE DATABASE border_empires_staging;
CREATE ROLE be_staging LOGIN PASSWORD '${STAGING_PASSWORD}';
GRANT ALL PRIVILEGES ON DATABASE border_empires_staging TO be_staging;
SQL

echo ""
echo "=== Creating staging Fly apps ==="

# Gateway staging
if fly apps list 2>/dev/null | grep -q "border-empires-gateway-staging"; then
  echo "✓ border-empires-gateway-staging already exists"
else
  fly apps create border-empires-gateway-staging
fi

# Simulation staging
if fly apps list 2>/dev/null | grep -q "border-empires-simulation-staging"; then
  echo "✓ border-empires-simulation-staging already exists"
else
  fly apps create border-empires-simulation-staging
fi

echo ""
echo "=== Attaching Postgres to staging apps ==="

# Attach staging DB to both apps (this sets DATABASE_URL secret automatically)
fly postgres attach border-empires-postgres \
  --app border-empires-gateway-staging \
  --database-name border_empires_staging \
  --variable-name DATABASE_URL 2>/dev/null || echo "(attachment may already exist)"

fly postgres attach border-empires-postgres \
  --app border-empires-simulation-staging \
  --database-name border_empires_staging \
  --variable-name DATABASE_URL 2>/dev/null || echo "(attachment may already exist)"

echo ""
echo "=== Setting additional secrets ==="

# Make simulation reachable from gateway via private networking
fly secrets set \
  SIMULATION_ADDRESS="border-empires-simulation-staging.flycast:50051" \
  --app border-empires-gateway-staging

echo ""
echo "✓ Provisioning complete."
echo ""
echo "Next steps:"
echo "  1. Run push-phase2.command to push the branch."
echo "  2. Open a PR and merge to main."
echo "  3. Deploy to staging:"
echo "     fly deploy --config fly.simulation.staging.toml"
echo "     fly deploy --config fly.gateway.staging.toml"
echo ""
echo "Done. You can close this window."
