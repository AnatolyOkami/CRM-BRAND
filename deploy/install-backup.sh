#!/usr/bin/env bash
# Prepares the nightly backup: an SSH key for GitHub and a cron job. Run once as root.
set -euo pipefail

if [ "$(id -u)" != "0" ]; then
  echo "Run as root" >&2
  exit 1
fi
key="${BACKUP_SSH_KEY:-/root/.ssh/crm_backup_ed25519}"
hour="${BACKUP_HOUR:-3}"
minute="${BACKUP_MINUTE:-17}"
crm_dir="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p /root/.ssh
chmod 700 /root/.ssh
if [ ! -f "$key" ]; then
  ssh-keygen -t ed25519 -N "" -C "crm-backup" -f "$key" >/dev/null
fi

cat > /etc/cron.d/crm-backup <<CRON
# Nightly encrypted backup of the CRM into a private GitHub repository
$minute $hour * * * root $crm_dir/deploy/backup.sh >> /var/log/crm-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/crm-backup

cat <<MSG
Cron job: every day at $(printf '%02d:%02d' "$hour" "$minute") server time (UTC unless you changed it).

Add this key to the PRIVATE backup repository on GitHub:
  Settings -> Deploy keys -> Add deploy key -> tick "Allow write access"

$(cat "$key.pub")

Then try it:  $crm_dir/deploy/backup.sh
MSG
