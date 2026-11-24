#!/usr/bin/env bash
# Connects the mailbox the CRM sends its letters from (invitations, password reset) to Supabase.
# The password is typed here, it is not shown and never leaves this server.
#
#   sudo deploy/set-smtp.sh
set -euo pipefail

SUPABASE_DIR="${SUPABASE_DIR:-/opt/supabase}"
ENV_FILE="$SUPABASE_DIR/.env"
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE" >&2; exit 1; }

read -r -p "SMTP server [smtp.beget.com]: " host
host="${host:-smtp.beget.com}"
read -r -p "SMTP port [465]: " port
port="${port:-465}"
read -r -p "Mailbox, the full address (it is also the login): " user
read -r -s -p "Mailbox password (not shown): " pass
echo
read -r -p "Sender name in letters [CRM]: " sender
sender="${sender:-CRM}"

if [ -z "$user" ] || [ -z "$pass" ]; then
  echo "The mailbox and the password are required" >&2
  exit 1
fi
if [[ "$pass$sender$host" == *"'"* ]]; then
  echo "A single quote ' is not allowed in these values" >&2
  exit 1
fi

# Values go to the .env in single quotes: $ and # in a password stay as they are
ENV_FILE="$ENV_FILE" SMTP_HOST="$host" SMTP_PORT="$port" SMTP_USER="$user" \
  SMTP_PASS="$pass" SMTP_SENDER_NAME="$sender" SMTP_ADMIN_EMAIL="$user" \
  node -e '
const fs = require("node:fs");
const file = process.env.ENV_FILE;
let text = fs.readFileSync(file, "utf8");
for (const key of ["SMTP_ADMIN_EMAIL","SMTP_HOST","SMTP_PORT","SMTP_USER","SMTP_PASS","SMTP_SENDER_NAME"]) {
  const line = `${key}=\x27${process.env[key]}\x27`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  text = pattern.test(text)
    ? text.replace(pattern, () => line)
    : `${text.replace(/\n*$/, "\n")}${line}\n`;
}
fs.writeFileSync(file, text);
'
chmod 600 "$ENV_FILE"

(cd "$SUPABASE_DIR" && docker compose up -d auth)
echo "Mail settings saved, the login service restarted."

read -r -p "Send a test letter (password reset) to which address? [skip]: " test_to
if [ -n "$test_to" ]; then
  api_domain="$(grep '^API_DOMAIN=' /opt/crm/deploy/web.env | cut -d= -f2-)"
  anon_key="$(grep '^ANON_KEY=' "$ENV_FILE" | cut -d= -f2-)"
  sleep 5
  curl -sS -o /dev/null -w "Server answer: %{http_code} (200 means the letter was handed to the mail server)\n" \
    -X POST "https://$api_domain/auth/v1/recover" \
    -H "apikey: $anon_key" -H "Content-Type: application/json" \
    -d "{\"email\":\"$test_to\"}"
  echo "Check the inbox and the Spam folder in a minute."
fi
