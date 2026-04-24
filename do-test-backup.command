#!/bin/bash
set -e
cd ~/Sites/border-empires-container/border-empires

echo "=== Pushing latest commits to origin/main ==="
git push origin main
echo "✓ Push done"

echo ""
echo "=== Triggering Nightly Postgres backup ==="
gh workflow run "Nightly Postgres backup"
echo "Waiting 90s for run to complete (new connectivity probe step adds ~30s)..."
sleep 90

echo ""
echo "=== Recent pg-backup runs ==="
gh run list --workflow="nightly-pg-backup.yml" --limit 3

echo ""
echo "Done! Check https://github.com/BenjaminWaye/border-empires/actions"
echo "Press any key to close..."
read -n1
