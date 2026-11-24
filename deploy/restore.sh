#!/usr/bin/env bash
# Restores a backup made by backup.sh into a FRESH installation: server-setup.sh and deploy/update.sh
# have been run (the structure exists, the tables are empty). It replaces the data of the CRM.
#
#   deploy/restore.sh <private-key-file> <backup file>... [--yes]
#
# A backup cut into parts is given as all its parts:  crm-2026-11-24.tar.age.part-*
set -euo pipefail

yes=false
args=()
for arg in "$@"; do
  if [ "$arg" = "--yes" ]; then yes=true; else args+=("$arg"); fi
done
if [ "${#args[@]}" -lt 2 ]; then
  echo "Usage: $0 <private-key-file> <backup file>... [--yes]" >&2
  exit 2
fi
key="${args[0]}"
files=("${args[@]:1}")

SUPABASE_DIR="${SUPABASE_DIR:-/opt/supabase}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
STORAGE_CONTAINER="${STORAGE_CONTAINER:-supabase-storage}"

if [ "$yes" != "true" ]; then
  read -r -p "This REPLACES all data of the CRM on this server. Type yes to go on: " answer
  [ "$answer" = "yes" ] || { echo "Cancelled"; exit 1; }
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "== Decrypt"
cat "${files[@]}" | age -d -i "$key" | tar -x -C "$work"
[ -f "$work/db.dump" ] || { echo "db.dump is not in the backup" >&2; exit 1; }

echo "== Database"
# every table the backup has data for is emptied first, then loaded
docker exec -i "$DB_CONTAINER" pg_restore -l < "$work/db.dump" \
  | awk '$4 == "TABLE" && $5 == "DATA" { printf "truncate table \"%s\".\"%s\" cascade;\n", $6, $7 }' \
  | docker exec -i "$DB_CONTAINER" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -X -q
# supabase_admin is the superuser: triggers are switched off while the data is loaded
docker exec -i "$DB_CONTAINER" pg_restore -U supabase_admin --data-only --disable-triggers \
  --no-owner -d postgres < "$work/db.dump"

if [ -f "$work/storage.tar" ]; then
  echo "== Files"
  tar -x -C "$work" -f "$work/storage.tar"
  docker stop "$STORAGE_CONTAINER" >/dev/null
  mkdir -p "$SUPABASE_DIR/volumes/storage"
  cp -a "$work/storage/." "$SUPABASE_DIR/volumes/storage/"
  docker start "$STORAGE_CONTAINER" >/dev/null
fi
echo "Restored"
