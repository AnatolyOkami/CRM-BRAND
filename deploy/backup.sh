#!/usr/bin/env bash
# Daily backup of the data of the CRM: the database and the uploaded files, encrypted with a PUBLIC
# key, pushed to a private GitHub repository. Only the encrypted file leaves the server, and only
# the owner of the private key can read it.
#
# Cron runs it every night (see deploy/install-backup.sh). By hand:  deploy/backup.sh
set -euo pipefail

ENV_FILE="${CRM_WEB_ENV:-/opt/crm/deploy/web.env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi
: "${BACKUP_REPO:?BACKUP_REPO is not set in $ENV_FILE}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is not set in $ENV_FILE}"
SUPABASE_DIR="${SUPABASE_DIR:-/opt/supabase}"
BACKUP_WORK="${BACKUP_WORK:-/opt/crm-backups}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
# how many daily copies are kept on the server and in the repository
KEEP_DAYS="${KEEP_DAYS:-14}"
# GitHub refuses files over 100 MB: bigger copies are cut into parts
PART_SIZE="${PART_SIZE:-90M}"
SSH_KEY="${BACKUP_SSH_KEY:-/root/.ssh/crm_backup_ed25519}"

stamp="$(date -u +%Y-%m-%d)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$BACKUP_WORK/local"

echo "== Database"
# data only: the structure comes from the migrations of the CRM on a fresh server
docker exec "$DB_CONTAINER" pg_dump -U postgres -Fc -a --no-owner \
  -n public -n private -n auth -n storage \
  -T auth.schema_migrations -T storage.migrations postgres > "$work/db.dump"

echo "== Files"
parts=(db.dump)
if [ -d "$SUPABASE_DIR/volumes/storage" ]; then
  tar -C "$SUPABASE_DIR/volumes" -cf "$work/storage.tar" storage
  parts+=(storage.tar)
fi

echo "== Encrypt"
tar -C "$work" -cf - "${parts[@]}" | age -r "$BACKUP_AGE_RECIPIENT" -o "$BACKUP_WORK/local/crm-$stamp.tar.age"
find "$BACKUP_WORK/local" -name 'crm-*.tar.age' -mtime "+$KEEP_DAYS" -delete

echo "== GitHub"
# The repository is rebuilt as ONE commit from the copies that are kept: it never grows and old
# data does not stay in its history.
repo="$work/github"
mkdir -p "$repo/daily"
for file in $(ls -1 "$BACKUP_WORK"/local/crm-*.tar.age | tail -n "$KEEP_DAYS"); do
  base="$(basename "$file")"
  if [ "$(stat -c %s "$file")" -gt $((90 * 1024 * 1024)) ]; then
    split -b "$PART_SIZE" -d "$file" "$repo/daily/$base.part-"
  else
    cp "$file" "$repo/daily/$base"
  fi
done
cat > "$repo/README.md" <<'README'
Encrypted backups of the CRM. Every file is encrypted with age and cannot be read without the
private key of the owner. Restore: see deploy/README.md of the CRM repository.
README
git -C "$repo" init -q -b main
git -C "$repo" add -A
git -C "$repo" -c user.name="CRM backup" -c user.email="backup@localhost" commit -q -m "Backup $stamp"
export GIT_SSH_COMMAND="ssh -i $SSH_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
git -C "$repo" push -q --force "$BACKUP_REPO" main

date -u +%FT%TZ > "$BACKUP_WORK/last-success"
echo "Backup $stamp done"
