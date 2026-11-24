#!/usr/bin/env bash
# Applies the SQL migrations of supabase/migrations that this database has not seen yet, in order.
# Every file runs in one transaction together with its record: a failed file changes nothing.
set -euo pipefail
cd "$(dirname "$0")/.."

DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
psql_db() { docker exec -i "$DB_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -X -q "$@"; }

psql_db -c "create schema if not exists crm_deploy;
  create table if not exists crm_deploy.applied_migrations (
    name text primary key,
    applied_at timestamptz not null default now());"

applied=0
for file in supabase/migrations/*.sql; do
  name="$(basename "$file")"
  seen="$(psql_db -tA -c "select 1 from crm_deploy.applied_migrations where name = '$name'")"
  if [ "$seen" = "1" ]; then
    continue
  fi
  echo "Applying $name"
  {
    echo "begin;"
    cat "$file"
    echo
    echo "insert into crm_deploy.applied_migrations (name) values ('$name');"
    echo "commit;"
  } | psql_db
  applied=$((applied + 1))
done
echo "Migrations applied: $applied"
