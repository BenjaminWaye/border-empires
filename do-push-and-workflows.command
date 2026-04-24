#!/bin/bash
# Runs git push + triggers both nightly workflows
# Double-click this file in Finder to execute.
set -e
cd ~/Sites/border-empires-container/border-empires

echo "=== Pushing commits to origin/main ==="
git log --oneline origin/main..HEAD
git push origin main
echo "✓ Push done"

echo ""
echo "=== Triggering Nightly Postgres backup ==="
gh workflow run "Nightly Postgres backup" || echo "  (gh workflow trigger failed — may need gh auth)"

echo ""
echo "=== Triggering Nightly load harness (5-min soak) ==="
gh workflow run "Nightly load harness" -f soak_minutes=5 || echo "  (gh workflow trigger failed — may need gh auth)"

echo ""
echo "=== Recent workflow runs ==="
sleep 5
gh run list --limit 5

echo ""
echo "Done! Check https://github.com/BenjaminWaye/border-empires/actions"
echo "Press any key to close..."
read -n1
