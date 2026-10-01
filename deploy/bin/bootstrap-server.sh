#!/usr/bin/env bash
# One-time (idempotent) setup for a fresh Ubuntu 24.04 Hetzner server. Run as
# root from a copy of this directory:
#
#   scp -r deploy root@<ip>:/root/deploy
#   ssh root@<ip> \
#     BE_ENV=staging BE_HOSTNAME=api-staging.borderempires.com \
#     ADMIN_PUBKEY="$(cat ~/.ssh/id_ed25519.pub)" \
#     CI_PUBKEY="$(cat ~/.ssh/be_hetzner_deploy.pub)" \
#     BACKUP_BUCKET=be-backups-staging \
#     bash /root/deploy/bin/bootstrap-server.sh
#
# Required: BE_ENV (staging|production), BE_HOSTNAME, ADMIN_PUBKEY, CI_PUBKEY.
# Optional: BACKUP_BUCKET (enables B2 upload; also place rclone.conf, see below),
#           GITHUB_REPO (default BenjaminWaye/border-empires),
#           IMAGE_REPO (default ghcr.io/benjaminwaye/border-empires-combined).
#
# The CI key is restricted with `command=` to /opt/border-empires/bin/deploy
# (`<sha>` | `rollback` | `snapshot`). The admin key is a normal shell key for
# the `deploy` user (docker group). Does NOT start the app; the first deploy does.
set -euo pipefail

[ "$(id -u)" = "0" ] || { echo "run as root" >&2; exit 1; }
: "${BE_ENV:?}" "${BE_HOSTNAME:?}" "${ADMIN_PUBKEY:?}" "${CI_PUBKEY:?}"
case "$BE_ENV" in staging|production) ;; *) echo "BE_ENV must be staging|production" >&2; exit 1 ;; esac
GITHUB_REPO="${GITHUB_REPO:-BenjaminWaye/border-empires}"
IMAGE_REPO="${IMAGE_REPO:-ghcr.io/benjaminwaye/border-empires-combined}"
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades rsync zstd rclone

# --- Docker (official apt repo) ---
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
systemctl enable --now docker

# --- deploy user + keys ---
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
cat > /home/deploy/.ssh/authorized_keys <<KEYEOF
${ADMIN_PUBKEY}
command="/opt/border-empires/bin/deploy",restrict ${CI_PUBKEY}
KEYEOF
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

# --- ssh hardening (keys only; root stays key-only so you can't lock yourself out) ---
cat > /etc/ssh/sshd_config.d/99-border-empires.conf <<'SSHEOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
SSHEOF
systemctl reload ssh || systemctl reload sshd

# --- firewall (also attach a Hetzner Cloud Firewall: 22, 80, 443) ---
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

# --- directories + host config ---
# 10001:10001 must match `user:` in deploy/compose.yml.
# (mkdir+chown, not `install -o 10001`: Ubuntu 26.04's uutils install rejects numeric ids.)
mkdir -p /srv/border-empires/data/backups
chown 10001:10001 /srv/border-empires/data /srv/border-empires/data/backups
chmod 750 /srv/border-empires/data /srv/border-empires/data/backups
install -d -m 755 -o deploy -g deploy /srv/border-empires /srv/border-empires/backups
install -d -m 755 -o root -g root /opt/border-empires /opt/border-empires/bin
install -d -m 755 -o deploy -g deploy /opt/border-empires/env
install -d -m 750 -o deploy -g deploy /etc/border-empires
install -m 755 -o root -g root "${SRC_DIR}/bin/deploy" /opt/border-empires/bin/deploy
# `deploy` rewrites compose.yml/Caddyfile/env/.env/backup on each deploy.
chown deploy:deploy /opt/border-empires
cat > /etc/border-empires/host.conf <<CONFEOF
BE_ENV=${BE_ENV}
BE_HOSTNAME=${BE_HOSTNAME}
GITHUB_REPO=${GITHUB_REPO}
IMAGE_REPO=${IMAGE_REPO}
BACKUP_BUCKET=${BACKUP_BUCKET:-}
CONFEOF
chown deploy:deploy /etc/border-empires/host.conf
# Secrets: deploy-owned (the deploy script's `docker compose` reads env_file as
# `deploy`), mode 600. Filled by `pnpm ops:hetzner:copy-fly-secrets`.
[ -f /etc/border-empires/secrets.env ] || install -m 600 -o deploy -g deploy /dev/null /etc/border-empires/secrets.env

# --- hourly backup timer ---
install -m 644 "${SRC_DIR}/systemd/border-empires-backup.service" /etc/systemd/system/
install -m 644 "${SRC_DIR}/systemd/border-empires-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now border-empires-backup.timer

echo "bootstrap complete for ${BE_ENV} (${BE_HOSTNAME})."
echo "Next: place /etc/border-empires/rclone.conf (B2 remote 'b2', chmod 600, owner deploy) if BACKUP_BUCKET is set;"
echo "      copy secrets; make the GHCR package public after the first image push; run the deploy workflow."
