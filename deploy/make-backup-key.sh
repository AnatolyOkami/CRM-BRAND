#!/usr/bin/env bash
# Makes the key pair of the backups. The PUBLIC key goes to deploy/web.env (BACKUP_AGE_RECIPIENT):
# with it the server can encrypt. The PRIVATE key is the only way to read a backup: copy it off this
# server (password manager, your computer) and delete it from here.
set -euo pipefail

out="${1:-$HOME/crm-backup-private.key}"
if [ -e "$out" ]; then
  echo "$out exists: remove it or give another path" >&2
  exit 1
fi
age-keygen -o "$out" 2> "$out.pub.txt"
chmod 600 "$out"
public="$(sed -n 's/^Public key: //p' "$out.pub.txt")"
rm -f "$out.pub.txt"

cat <<MSG

PUBLIC key (put into deploy/web.env as BACKUP_AGE_RECIPIENT):
  $public

PRIVATE key is in $out.
Copy it now to a safe place outside this server, then delete it here:
  cat $out
  rm $out
Without it the backups cannot be opened: nobody can recover it, neither you nor GitHub.
MSG
