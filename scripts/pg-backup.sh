#!/usr/bin/env bash
# scripts/pg-backup.sh
#
# Nightly Postgres backup for border-empires-postgres → Fly Tigris object storage.
#
# Retention: 7 daily + 4 weekly dumps (older purged automatically).
# Cost: ~$0.10/mo at <1 GB backup size on Fly Tigris free tier.
#
# Usage (local / manual):
#   DATABASE_URL="postgres://be_prod:password@...flycast:5432/border_empires_prod" \
#   TIGRIS_BUCKET="border-empires-backups" \
#   AWS_ACCESS_KEY_ID="..." \
#   AWS_SECRET_ACCESS_KEY="..." \
#   bash scripts/pg-backup.sh
#
# In CI (GitHub Action nightly — see .github/workflows/nightly-pg-backup.yml):
#   Secrets are set via GitHub repository secrets, not committed here.
#
# Fly Tigris setup (one-time, run manually):
#   fly storage create border-empires-backups
#   fly storage show border-empires-backups   # copy credentials to GitHub secrets
#   # Required GitHub secrets:
#   #   TIGRIS_ACCESS_KEY_ID, TIGRIS_SECRET_ACCESS_KEY, TIGRIS_ENDPOINT_URL
#   #   PROD_DATABASE_URL (from fly secrets show border-empires-simulation)

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DATABASE_URL="${DATABASE_URL:?DATABASE_URL must be set}"
TIGRIS_BUCKET="${TIGRIS_BUCKET:-border-empires-backups}"
TIGRIS_ENDPOINT_URL="${TIGRIS_ENDPOINT_URL:-https://fly.storage.tigris.dev}"
AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID must be set (Tigris credential)}"
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY must be set (Tigris credential)}"
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY

KEEP_DAILY=7
KEEP_WEEKLY=4

NOW="$(date -u +%Y%m%dT%H%M%SZ)"
DATE="$(date -u +%Y-%m-%d)"
DOW="$(date -u +%u)"   # 1=Monday … 7=Sunday; weekly backup on Sunday (7)

DAILY_KEY="daily/${DATE}.sql.gz"
DUMP_FILE="/tmp/border-empires-backup-${NOW}.sql.gz"

# ---------------------------------------------------------------------------
# 1. Dump
# ---------------------------------------------------------------------------
echo "[$(date -u)] Starting pg_dump → ${DUMP_FILE}"
pg_dump --no-owner --no-acl "${DATABASE_URL}" | gzip -9 > "${DUMP_FILE}"
DUMP_SIZE="$(wc -c < "${DUMP_FILE}" | tr -d ' ')"
echo "[$(date -u)] Dump complete (${DUMP_SIZE} bytes compressed)"

# ---------------------------------------------------------------------------
# 2. Upload daily backup
# ---------------------------------------------------------------------------
aws --endpoint-url "${TIGRIS_ENDPOINT_URL}" \
    s3 cp "${DUMP_FILE}" "s3://${TIGRIS_BUCKET}/${DAILY_KEY}" \
    --no-progress \
    --metadata "created=${NOW},type=daily"
echo "[$(date -u)] Uploaded → s3://${TIGRIS_BUCKET}/${DAILY_KEY}"

# ---------------------------------------------------------------------------
# 3. Upload weekly backup (on Sundays)
# ---------------------------------------------------------------------------
if [ "${DOW}" = "7" ]; then
  WEEK="$(date -u +%Y-W%V)"
  WEEKLY_KEY="weekly/${WEEK}.sql.gz"
  aws --endpoint-url "${TIGRIS_ENDPOINT_URL}" \
      s3 cp "${DUMP_FILE}" "s3://${TIGRIS_BUCKET}/${WEEKLY_KEY}" \
      --no-progress \
      --metadata "created=${NOW},type=weekly"
  echo "[$(date -u)] Weekly backup uploaded → s3://${TIGRIS_BUCKET}/${WEEKLY_KEY}"
fi

# ---------------------------------------------------------------------------
# 4. Purge old daily backups (keep last KEEP_DAILY)
# ---------------------------------------------------------------------------
echo "[$(date -u)] Pruning old daily backups (keep=${KEEP_DAILY})..."
DAILY_KEYS="$(aws --endpoint-url "${TIGRIS_ENDPOINT_URL}" \
    s3 ls "s3://${TIGRIS_BUCKET}/daily/" \
    | awk '{print $4}' \
    | sort \
    | head -n -${KEEP_DAILY} \
    || true)"
if [ -n "${DAILY_KEYS}" ]; then
  for key in ${DAILY_KEYS}; do
    aws --endpoint-url "${TIGRIS_ENDPOINT_URL}" \
        s3 rm "s3://${TIGRIS_BUCKET}/daily/${key}" --quiet
    echo "[$(date -u)] Deleted old daily: daily/${key}"
  done
fi

# ---------------------------------------------------------------------------
# 5. Purge old weekly backups (keep last KEEP_WEEKLY)
# ---------------------------------------------------------------------------
echo "[$(date -u)] Pruning old weekly backups (keep=${KEEP_WEEKLY})..."
WEEKLY_KEYS="$(aws --endpoint-url "${TIGRIS_ENDPOINT_URL}" \
    s3 ls "s3://${TIGRIS_BUCKET}/weekly/" \
    | awk '{print $4}' \
    | sort \
    | head -n -${KEEP_WEEKLY} \
    || true)"
if [ -n "${WEEKLY_KEYS}" ]; then
  for key in ${WEEKLY_KEYS}; do
    aws --endpoint-url "${TIGRIS_ENDPOINT_URL}" \
        s3 rm "s3://${TIGRIS_BUCKET}/weekly/${key}" --quiet
    echo "[$(date -u)] Deleted old weekly: weekly/${key}"
  done
fi

# ---------------------------------------------------------------------------
# 6. Cleanup
# ---------------------------------------------------------------------------
rm -f "${DUMP_FILE}"
echo "[$(date -u)] ✓ Backup complete — s3://${TIGRIS_BUCKET}/${DAILY_KEY}"
