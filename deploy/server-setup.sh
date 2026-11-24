#!/usr/bin/env bash
# One time setup of a fresh Ubuntu server (Beget VPS): Docker, Node, firewall, the CRM code and a
# self-hosted Supabase with fresh secrets.
#
#   sudo ./server-setup.sh crm.example.ru api.example.ru
#
# Both domains must already point to the IP of this server (A records), Caddy needs it for HTTPS.
set -euo pipefail

if [ "$(id -u)" != "0" ]; then
  echo "Run as root: sudo $0 <web-domain> <api-domain>" >&2
  exit 1
fi
WEB_DOMAIN="${1:?Usage: $0 <web-domain> <api-domain>}"
API_DOMAIN="${2:?Usage: $0 <web-domain> <api-domain>}"

REPO_URL="${REPO_URL:-https://github.com/AnatolyOkami/CRM-BRAND.git}"
CRM_BRANCH="${CRM_BRANCH:-main}"
CRM_DIR="${CRM_DIR:-/opt/crm}"
SUPABASE_DIR="${SUPABASE_DIR:-/opt/supabase}"
SUPABASE_SRC="${SUPABASE_SRC:-/opt/supabase-src}"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git ufw age cron

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
if ! node --version 2>/dev/null | grep -q '^v2[2-9]'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# the firewall lets in SSH and the web only; Docker ports are bound to 127.0.0.1 by the override
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

if [ ! -d "$CRM_DIR/.git" ]; then
  git clone --branch "$CRM_BRANCH" "$REPO_URL" "$CRM_DIR"
fi
# shellcheck disable=SC1091
. "$CRM_DIR/deploy/versions.env"

if [ ! -d "$SUPABASE_SRC/.git" ]; then
  git clone --filter=blob:none --no-checkout https://github.com/supabase/supabase "$SUPABASE_SRC"
fi
git -C "$SUPABASE_SRC" sparse-checkout set docker
git -C "$SUPABASE_SRC" checkout "$SUPABASE_DOCKER_REF"

if [ -f "$SUPABASE_DIR/.env" ]; then
  echo "$SUPABASE_DIR/.env exists: the Supabase installation is kept as it is"
else
  mkdir -p "$SUPABASE_DIR"
  cp -r "$SUPABASE_SRC/docker/." "$SUPABASE_DIR/"
  cp "$CRM_DIR/deploy/docker-compose.override.yml" "$SUPABASE_DIR/docker-compose.override.yml"
  (cd "$CRM_DIR" && node scripts/configureSupabaseEnv.ts \
    --example "$SUPABASE_DIR/.env.example" --out "$SUPABASE_DIR/.env" \
    --web-domain "$WEB_DOMAIN" --api-domain "$API_DOMAIN")
fi

if [ ! -f "$CRM_DIR/deploy/web.env" ]; then
  anon_key="$(grep '^ANON_KEY=' "$SUPABASE_DIR/.env" | cut -d= -f2-)"
  sed -e "s#^WEB_DOMAIN=.*#WEB_DOMAIN=$WEB_DOMAIN#" \
      -e "s#^API_DOMAIN=.*#API_DOMAIN=$API_DOMAIN#" \
      -e "s#^SUPABASE_DIR=.*#SUPABASE_DIR=$SUPABASE_DIR#" \
      -e "s#^VITE_SUPABASE_URL=.*#VITE_SUPABASE_URL=https://$API_DOMAIN#" \
      -e "s#^VITE_SB_PUBLISHABLE_KEY=.*#VITE_SB_PUBLISHABLE_KEY=$anon_key#" \
      "$CRM_DIR/deploy/web.env.example" > "$CRM_DIR/deploy/web.env"
  chmod 600 "$CRM_DIR/deploy/web.env"
fi

echo "== Starting Supabase (the first start downloads the images, it takes a few minutes)"
(cd "$SUPABASE_DIR" && docker compose pull && docker compose up -d)

echo "== Waiting for the database"
for _ in $(seq 1 60); do
  if [ "$(docker inspect -f '{{.State.Health.Status}}' supabase-db 2>/dev/null)" = "healthy" ]; then
    break
  fi
  sleep 5
done

cat <<MSG

Supabase is running. Next, from $CRM_DIR:

  cd $CRM_DIR && deploy/update.sh

then open https://$WEB_DOMAIN and create the first account: it becomes the administrator.
Secrets are in $SUPABASE_DIR/.env (the Studio password is DASHBOARD_PASSWORD there). Keep a copy off the server.
MSG
