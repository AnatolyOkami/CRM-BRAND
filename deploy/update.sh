#!/usr/bin/env bash
# Brings this server to the latest code of the branch it follows: build, functions, migrations, web server.
# Run it from the terminal after every change:   cd /opt/crm && git pull && deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${CRM_WEB_ENV:-$PWD/deploy/web.env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE: copy deploy/web.env.example and fill it in" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
: "${SUPABASE_DIR:?SUPABASE_DIR is not set in $ENV_FILE}"
: "${VITE_SUPABASE_URL:?}" "${VITE_SB_PUBLISHABLE_KEY:?}"

echo "== Code"
git pull --ff-only
npm ci --ignore-scripts

echo "== Build"
npm run build
# the file the browser reads first: the settings of this installation
node scripts/renderRuntimeConfig.ts dist/config.js

echo "== Edge functions"
functions_dir="$SUPABASE_DIR/volumes/functions"
mkdir -p "$functions_dir"
for name in _shared users update_password merge_contacts delete_note_attachments; do
  rm -rf "${functions_dir:?}/$name"
  cp -r "supabase/functions/$name" "$functions_dir/$name"
done

echo "== Database"
deploy/migrate.sh

echo "== Restart"
docker restart supabase-edge-functions >/dev/null
docker compose --env-file "$ENV_FILE" -f deploy/docker-compose.web.yml up -d

echo "Done: https://$WEB_DOMAIN"
