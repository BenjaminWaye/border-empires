# Border Empires — Postgres Restore Runbook

> **Last updated:** 2026-04-20  
> **Applies to:** `border-empires-postgres` cluster, databases `border_empires_staging` and `border_empires_prod`  
> **Companion:** `scripts/pg-backup.sh`, `docs/rewrite-completion-plan-2026-04-19.md §11`

---

## 0. Background

The `border-empires-postgres` cluster is a single-primary Fly Postgres instance (no HA, no read replica) — a deliberate trade-off to stay under the $10/month Fly budget. This means backups are the **only** automatic recovery path if the Fly volume is lost or the primary is permanently unavailable.

Backups run nightly via `.github/workflows/nightly-pg-backup.yml` using `scripts/pg-backup.sh`. They land in the Fly Tigris bucket `border-empires-backups` under:

```
daily/YYYY-MM-DD.sql.gz    (7 retained)
weekly/YYYY-W##.sql.gz     (4 retained)
```

---

## 1. Rotating the staging Postgres password

The `be_staging` role was initially created with a placeholder password. Rotate it immediately after first provisioning and before Phase 6.

```bash
# 1. Generate a new strong password and save to 1Password first.
STAGING_PASSWORD="$(openssl rand -base64 32)"
echo "New staging password: ${STAGING_PASSWORD}"
# Save this in 1Password → "Border Empires / be_staging Postgres"

# 2. Connect to the Postgres cluster and change the password.
fly postgres connect -a border-empires-postgres << SQL
ALTER ROLE be_staging WITH PASSWORD '${STAGING_PASSWORD}';
SQL

# 3. Update the DATABASE_URL secret on both staging apps to use the new password.
#    The URL format is: postgres://be_staging:PASSWORD@border-empires-postgres.flycast:5432/border_empires_staging
fly secrets set \
  DATABASE_URL="postgres://be_staging:${STAGING_PASSWORD}@border-empires-postgres.flycast:5432/border_empires_staging" \
  --app border-empires-gateway-staging

fly secrets set \
  DATABASE_URL="postgres://be_staging:${STAGING_PASSWORD}@border-empires-postgres.flycast:5432/border_empires_staging" \
  --app border-empires-simulation-staging

# 4. Restart staging apps to pick up new credential.
fly machines restart --app border-empires-gateway-staging
fly machines restart --app border-empires-simulation-staging
```

After rotation, there should be no committed file in the repo containing `staging_changeme` as a real credential. A CI guard checks for this — see `.github/workflows/ci.yml`.

---

## 2. Taking a manual backup

```bash
# Export DATABASE_URL from Fly secrets:
DATABASE_URL="$(fly secrets list --app border-empires-simulation | grep DATABASE_URL | awk '{print $2}')"
# Or set it directly if you have it in 1Password.

export DATABASE_URL
export AWS_ACCESS_KEY_ID="<tigris-access-key>"
export AWS_SECRET_ACCESS_KEY="<tigris-secret-key>"
export TIGRIS_BUCKET="border-empires-backups"

bash scripts/pg-backup.sh
```

---

## 3. Listing available backups

```bash
export AWS_ACCESS_KEY_ID="<tigris-access-key>"
export AWS_SECRET_ACCESS_KEY="<tigris-secret-key>"

# Daily backups
aws --endpoint-url https://fly.storage.tigris.dev \
    s3 ls s3://border-empires-backups/daily/

# Weekly backups
aws --endpoint-url https://fly.storage.tigris.dev \
    s3 ls s3://border-empires-backups/weekly/
```

---

## 4. Restore to a throwaway Postgres instance (recommended for testing)

Use this procedure for the **Phase 6 pre-flight restore dry-run** and for any restore test.

### 4a. Download the backup

```bash
BACKUP_DATE="2026-04-20"   # change to the date you want to restore
DUMP_FILE="/tmp/restore-${BACKUP_DATE}.sql.gz"

export AWS_ACCESS_KEY_ID="<tigris-access-key>"
export AWS_SECRET_ACCESS_KEY="<tigris-secret-key>"

aws --endpoint-url https://fly.storage.tigris.dev \
    s3 cp "s3://border-empires-backups/daily/${BACKUP_DATE}.sql.gz" "${DUMP_FILE}"
```

### 4b. Spin up a throwaway Postgres on Fly

```bash
fly postgres create \
  --name border-empires-postgres-restore-test \
  --region arn \
  --initial-cluster-size 1 \
  --vm-size shared-cpu-1x \
  --volume-size 3     # 3 GB is enough for a test
```

### 4c. Create the target database

```bash
fly postgres connect -a border-empires-postgres-restore-test << 'SQL'
CREATE DATABASE border_empires_restore_test;
SQL
```

### 4d. Restore

```bash
RESTORE_URL="$(fly postgres show -a border-empires-postgres-restore-test --json | jq -r '.connection_string')/border_empires_restore_test"

gunzip -c "${DUMP_FILE}" | psql "${RESTORE_URL}"
echo "Restore complete"
```

### 4e. Verify: boot simulation against the restored DB

```bash
# Point the simulation at the restore URL (local process, not Fly app)
DATABASE_URL="${RESTORE_URL}" \
NODE_ENV=test \
SIMULATION_ALLOW_SEED_RECOVERY_FALLBACK=0 \
  pnpm --filter @border-empires/simulation dev &

SIM_PID=$!
sleep 10   # wait for boot

# Run the restart-parity integration test suite
DATABASE_URL="${RESTORE_URL}" \
  pnpm --filter @border-empires/simulation test -- restart-parity.integration

kill $SIM_PID
```

Acceptance: `restart-parity.integration.test.ts` exits green (all command types survive a cold restart from the restored DB).

### 4f. Teardown

```bash
fly apps destroy border-empires-postgres-restore-test --yes
rm -f "${DUMP_FILE}"
```

---

## 5. Restore in-place to production (live-failure procedure)

Use this **only** if the `border-empires-postgres` Fly volume is lost and `fly postgres restart` doesn't recover it. This is Rollback Path B from `docs/rewrite-completion-plan-2026-04-19.md §11`.

Expected downtime: 15–30 minutes.

```bash
# 1. Flip all clients back to the legacy monolith (set VITE_WS_URL in client build).
#    This keeps beta testers on legacy while Postgres is unavailable.

# 2. Download the most recent backup.
DUMP_FILE="/tmp/prod-restore.sql.gz"
aws --endpoint-url https://fly.storage.tigris.dev \
    s3 cp "s3://border-empires-backups/daily/$(date -u +%Y-%m-%d).sql.gz" "${DUMP_FILE}" \
  || aws --endpoint-url https://fly.storage.tigris.dev \
    s3 ls s3://border-empires-backups/daily/ | sort | tail -1 | awk '{print $4}' | \
    xargs -I{} aws --endpoint-url https://fly.storage.tigris.dev \
      s3 cp "s3://border-empires-backups/daily/{}" "${DUMP_FILE}"

# 3. Create a fresh Postgres cluster (new volume).
fly postgres create \
  --name border-empires-postgres \
  --region arn \
  --initial-cluster-size 1 \
  --vm-size shared-cpu-1x \
  --volume-size 10

# 4. Re-create the databases and roles with original passwords (from 1Password).
PROD_PASSWORD="<from 1Password: Border Empires / be_prod Postgres>"
STAGING_PASSWORD="<from 1Password: Border Empires / be_staging Postgres>"

fly postgres connect -a border-empires-postgres << SQL
CREATE DATABASE border_empires_prod;
CREATE ROLE be_prod LOGIN PASSWORD '${PROD_PASSWORD}';
GRANT ALL PRIVILEGES ON DATABASE border_empires_prod TO be_prod;

CREATE DATABASE border_empires_staging;
CREATE ROLE be_staging LOGIN PASSWORD '${STAGING_PASSWORD}';
GRANT ALL PRIVILEGES ON DATABASE border_empires_staging TO be_staging;
SQL

# 5. Restore production data.
RESTORE_URL="postgres://be_prod:${PROD_PASSWORD}@border-empires-postgres.flycast:5432/border_empires_prod"
gunzip -c "${DUMP_FILE}" | psql "${RESTORE_URL}"

# 6. Re-run migrations to ensure schema is current.
#    (pg_restore preserves schema, but run anyway to be safe.)
for sql_file in apps/simulation/sql/*.sql apps/realtime-gateway/sql/*.sql; do
  fly postgres connect -a border-empires-postgres --database border_empires_prod < "${sql_file}" || true
done

# 7. Re-attach DATABASE_URL secrets.
fly postgres attach border-empires-postgres \
  --app border-empires-gateway \
  --database-name border_empires_prod \
  --variable-name DATABASE_URL

fly postgres attach border-empires-postgres \
  --app border-empires-simulation \
  --database-name border_empires_prod \
  --variable-name DATABASE_URL

# 8. Restart the production apps.
fly machines restart --app border-empires-gateway
fly machines restart --app border-empires-simulation

# 9. Verify /healthz on both apps returns 200 with runtime provenance.
curl -sf https://border-empires-gateway.fly.dev/healthz | jq .
curl -sf https://border-empires-simulation.fly.dev/healthz | jq .

# 10. Run a short load-harness smoke against the restored stack.
WS_URL="wss://border-empires-gateway.fly.dev/ws" \
LOAD_HARNESS_SOAK_MINUTES=5 \
  node scripts/rewrite-load-harness.mjs

# 11. If green, flip clients back to the new stack (revert step 1).
```

---

## 6. Backup verification checklist (required before Phase 6)

Before scheduling the Phase 6 cutover date, confirm all items:

- [ ] `scripts/pg-backup.sh` ran successfully at least once (check GitHub Actions log)
- [ ] A backup file exists at `s3://border-empires-backups/daily/`
- [ ] Restore dry-run completed (§4 above) — `restart-parity.integration.test.ts` green against restored DB
- [ ] `be_staging` password rotated off `staging_changeme` (§1 above)
- [ ] `be_prod` password set to a strong value (never a placeholder)
- [ ] Both 1Password entries (`be_staging Postgres`, `be_prod Postgres`) current
- [ ] Nightly backup GitHub Action green for at least 2 consecutive runs

---

## 7. Cost accounting

| Resource | Est. cost/mo |
|---|---|
| Fly Tigris storage (daily+weekly, <1 GB total) | ~$0.00–$0.10 |
| GitHub Actions runner (nightly backup job, ~5 min) | $0 (free tier) |
| **Total backup overhead** | **<$0.10/mo** |

Within the $10/month hard cap.
