#!/usr/bin/env bash
# One-shot installer for the read-only logs key on an existing Hetzner server.
# Built to be pasted into the Hetzner web console, whose keyboard mapping
# mangles shifted symbols (`:` arrives as `;`), so the command to fetch it uses
# no shifted characters:
#
#   curl --proto-default https -fso i raw.githubusercontent.com/BenjaminWaye/border-empires/logskey/deploy/bin/install-logs-key.sh; bash i
#
# (`logskey` is a short git tag: the console also truncates pastes at ~165
# characters, so a 40-char sha does not fit.)
#
# Installs the pinned, checksum-verified deploy/bin/deploy (adds the `logs`
# verb and `--logs-only` mode) and appends the logs key's authorized_keys line
# (forced to `deploy --logs-only`). Idempotent. Run as root.
set -euo pipefail

DEPLOY_SRC_SHA=1ac78fd0c98b4f382316d9fd87a2d3bd41b6090d
DEPLOY_SHA256=1d82fa6f3df623ac9c6fab8f3641dfe9d789c5ba0ec970649257eea4c15534ac
KEY_LINE='command="/opt/border-empires/bin/deploy --logs-only",restrict ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBM6fkWufDjI0XbVF6qOZCl7luw0uognEbmPuhPGhFWz claude-logs@border-empires'
# Overridable only for local testing.
DEPLOY_BIN="${DEPLOY_BIN:-/opt/border-empires/bin/deploy}"
AUTH_KEYS="${AUTH_KEYS:-/home/deploy/.ssh/authorized_keys}"

[ "$(id -u)" = "0" ] || [ -n "${ALLOW_NON_ROOT:-}" ] || { echo "FAILED: run as root" >&2; exit 1; }

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
curl --proto =https -fsSL -o "$tmp" \
  "https://raw.githubusercontent.com/BenjaminWaye/border-empires/${DEPLOY_SRC_SHA}/deploy/bin/deploy"
echo "${DEPLOY_SHA256}  ${tmp}" | sha256sum -c --quiet - || { echo "FAILED: deploy script checksum mismatch" >&2; exit 1; }
install -m 755 "$tmp" "$DEPLOY_BIN"

[ -f "$AUTH_KEYS" ] || { echo "FAILED: $AUTH_KEYS not found" >&2; exit 1; }
grep -qxF "$KEY_LINE" "$AUTH_KEYS" || printf '%s\n' "$KEY_LINE" >> "$AUTH_KEYS"

# Debris from a truncated console paste of the old manual steps.
rm -f /opt/border-empi

echo "OK: logs key installed on $(hostname)"
