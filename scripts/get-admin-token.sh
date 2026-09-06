#!/usr/bin/env bash
# get-admin-token.sh — fetch the live ADMIN_API_TOKEN from a running Fly app.
#
# Why: ADMIN_API_TOKEN is stored once, in Fly secrets, for each app
# (border-empires-combined-staging / border-empires-combined). Fly secrets are
# write-only via the CLI (`flyctl secrets list` never returns values), so the
# only way to read the live value back out is to ask a running machine for its
# own environment. This script does that over `flyctl ssh console`, so:
#   - there is exactly one place the token lives (Fly secrets) — nothing to
#     keep in sync across laptops, .zshrc files, or agent configs
#   - access is gated by Fly org membership, which the team already manages —
#     no separate vault account or shared static copy to hand out or revoke
#   - a token rotation (`flyctl secrets set ADMIN_API_TOKEN=...`) is picked up
#     immediately by every caller of this script, with nothing else to update
#
# Usage:
#   scripts/get-admin-token.sh [-a <app>]
#     -a, --app     Fly app name (default: border-empires-combined-staging)
#
# Examples:
#   scripts/get-admin-token.sh
#   scripts/get-admin-token.sh -a border-empires-combined
#   ADMIN_API_TOKEN="$(scripts/get-admin-token.sh)" \
#     curl -H "Authorization: Bearer $ADMIN_API_TOKEN" \
#     https://border-empires-combined-staging.fly.dev/admin/debug/ai
#
# Requires: flyctl (or fly), authenticated against an account with access to
# the target app's Fly org. Prints only the token value to stdout; all other
# output goes to stderr so this is safe to use in command substitution.

set -euo pipefail

APP="border-empires-combined-staging"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -a|--app)
      APP="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,26p' "$0" >&2; exit 0 ;;
    *)
      echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if ! command -v flyctl >/dev/null 2>&1 && ! command -v fly >/dev/null 2>&1; then
  echo "error: neither flyctl nor fly is on PATH" >&2
  exit 127
fi

FLY_BIN="$(command -v flyctl || command -v fly)"

TOKEN="$("$FLY_BIN" ssh console -a "$APP" -C "printenv ADMIN_API_TOKEN" 2>/dev/null | tr -d '\r\n')"

if [[ -z "$TOKEN" ]]; then
  echo "error: ADMIN_API_TOKEN not set on app '$APP', or you lack ssh access to it" >&2
  exit 1
fi

echo "$TOKEN"
