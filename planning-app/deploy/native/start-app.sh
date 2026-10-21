#!/usr/bin/env bash
set -euo pipefail
# systemd decrypts this root-owned credential into the private per-service directory.
# Never trace the shell, print this value, or store it in source/runtime.env.
if [ -n "${CREDENTIALS_DIRECTORY:-}" ] && [ -r "$CREDENTIALS_DIRECTORY/hostinger-mail-api" ]; then
  HOSTINGER_MAIL_API_TOKEN=$(cat "$CREDENTIALS_DIRECTORY/hostinger-mail-api")
  export HOSTINGER_MAIL_API_TOKEN
fi
exec /usr/bin/node /opt/retireplan/current/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3117
