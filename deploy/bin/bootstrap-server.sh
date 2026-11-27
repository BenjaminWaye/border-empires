#!/usr/bin/env bash
# One-time (idempotent) setup for a fresh Ubuntu 24.04 Hetzner server. Run as
# root from a copy of this directory:
#
#   scp -r deploy root@<ip>:/root/deploy
#   ssh root@<ip> \
#     BE_ENV=staging BE_HOSTNAME=api-staging.borderempires.com \
#     ADMIN_PUBKEY="$(cat ~/.ssh/id_ed25519.pub)" \
#     CI_PUBKEY="$(cat ~/.ssh/be_hetzner_deploy.pub)" \
#     bash /root/deploy/bin/bootstrap-server.sh
#
# Required: BE_ENV (staging|production|hosted), BE_HOSTNAME, and for staging
# and production ADMIN_PUBKEY and CI_PUBKEY.
#
# BE_ENV=hosted is a hosted sector server (docs/hosted-sectors-plan.md). The
# hosting service creates it with cloud-init, which runs this script. It gets
# no SSH key at all, SSH is switched off and port 22 is closed in the
# firewall: nobody logs in, the server is replaced rather than repaired, and it
# is deleted when its contest is over. It does not get fail2ban either (there
# is no SSH to protect).
# Optional: BACKUP_BUCKET (enables B2 upload; also place rclone.conf, see below),
#           BACKUP_TIMER=on|off (hourly backup timer; default off, on for hosted),
#           GITHUB_REPO (default BenjaminWaye/border-empires),
#           IMAGE_REPO (default ghcr.io/benjaminwaye/border-empires-combined),
#           LOGS_PUBKEY (read-only key for scripts/ops/backend-logs.sh).
#
# The CI key is restricted with `command=` to /opt/border-empires/bin/deploy
# (`<sha>` | `rollback` | `snapshot` | `logs` | `client <sha>` | `client-rollback`). LOGS_PUBKEY, if set, is forced to
# `deploy --logs-only`, which refuses everything but `logs`. The admin key is a normal shell key for
# the `deploy` user (docker group). Does NOT start the app; the first deploy does.
set -euo pipefail

[ "$(id -u)" = "0" ] || { echo "run as root" >&2; exit 1; }
: "${BE_ENV:?}" "${BE_HOSTNAME:?}"
case "$BE_ENV" in
  staging|production) : "${ADMIN_PUBKEY:?}" "${CI_PUBKEY:?}" ;;
  hosted) ;;
  *) echo "BE_ENV must be staging|production|hosted" >&2; exit 1 ;;
esac
GITHUB_REPO="${GITHUB_REPO:-BenjaminWaye/border-empires}"
IMAGE_REPO="${IMAGE_REPO:-ghcr.io/benjaminwaye/border-empires-combined}"
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw unattended-upgrades rsync zstd rclone
[ "$BE_ENV" = hosted ] || apt-get install -y fail2ban

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
if [ "$BE_ENV" = hosted ]; then
  : > /home/deploy/.ssh/authorized_keys
else
  cat > /home/deploy/.ssh/authorized_keys <<KEYEOF
${ADMIN_PUBKEY}
command="/opt/border-empires/bin/deploy",restrict ${CI_PUBKEY}
KEYEOF
fi
[ -z "${LOGS_PUBKEY:-}" ] || echo "command=\"/opt/border-empires/bin/deploy --logs-only\",restrict ${LOGS_PUBKEY}" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

# --- ssh hardening (keys only; root stays key-only so you can't lock yourself out) ---
cat > /etc/ssh/sshd_config.d/99-border-empires.conf <<'SSHEOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
SSHEOF
# On Ubuntu 24.04 ssh.service is socket-activated and stays inactive until the
# first connection, so a plain `reload` fails there (and `set -e` would stop
# this script). try-reload-or-restart does nothing for an inactive unit.
if [ "$BE_ENV" = hosted ]; then
  # Nobody logs in to a hosted sector (and cloud-init never connects): switch
  # SSH off, not just firewall it. Each unit on its own, since one missing unit
  # makes a combined `disable` do nothing; then make sure, and stop otherwise.
  for unit in ssh.socket ssh.service; do systemctl disable --now "$unit" 2>/dev/null || true; done
  if systemctl is-active --quiet ssh.socket || systemctl is-active --quiet ssh.service; then
    echo "SSH is still running on a hosted sector server" >&2
    exit 1
  fi
else
  # Check the config first: with an inactive unit nothing else would.
  sshd -t
  systemctl try-reload-or-restart ssh
fi

# --- firewall (also attach a Hetzner Cloud Firewall: 22, 80, 443; hosted: 80, 443) ---
ufw default deny incoming
ufw default allow outgoing
[ "$BE_ENV" = hosted ] || ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
[ "$BE_ENV" = hosted ] || systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

# --- directories + host config ---
# 10001:10001 must match `user:` in deploy/compose.yml.
# (mkdir+chown, not `install -o 10001`: Ubuntu 26.04's uutils install rejects numeric ids.)
mkdir -p /srv/border-empires/data/backups
chown 10001:10001 /srv/border-empires/data /srv/border-empires/data/backups
chmod 750 /srv/border-empires/data /srv/border-empires/data/backups
install -d -m 755 -o deploy -g deploy /srv/border-empires /srv/border-empires/backups
install -d -m 755 -o deploy -g deploy /srv/border-empires/client
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
# `deploy`), mode 600. Filled by hand on the server; values never live in the repo.
[ -f /etc/border-empires/secrets.env ] || install -m 600 -o deploy -g deploy /dev/null /etc/border-empires/secrets.env

# --- hourly backup timer ---
install -m 644 "${SRC_DIR}/systemd/border-empires-backup.service" /etc/systemd/system/
install -m 644 "${SRC_DIR}/systemd/border-empires-backup.timer" /etc/systemd/system/
systemctl daemon-reload
# The timer is only switched on when asked (BACKUP_TIMER=on), so re-running this
# script never turns backups on by accident. Switch-on steps: docs/agents/deploys.md "Backups".
# Hosted sector servers keep their earlier default (on, local copies only).
default_timer=off
[ "$BE_ENV" = hosted ] && default_timer=on
if [ "${BACKUP_TIMER:-$default_timer}" = on ]; then
  systemctl enable --now border-empires-backup.timer
else
  echo "backup timer installed but not enabled (set BACKUP_TIMER=on, or: systemctl enable --now border-empires-backup.timer)"
fi

echo "bootstrap complete for ${BE_ENV} (${BE_HOSTNAME})."
echo "Next: place /etc/border-empires/rclone.conf (B2 remote 'b2', chmod 600, owner deploy) if BACKUP_BUCKET is set;"
echo "      copy secrets; make the GHCR package public after the first image push; run the deploy workflow."
