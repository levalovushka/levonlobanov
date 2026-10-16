#!/usr/bin/env bash
# Sync infra/caddy to /srv/caddy on the server and apply it.
# Needs the `folio` host alias in ~/.ssh/config; override with HOST=...
set -euo pipefail

HOST="${HOST:-folio}"
cd "$(dirname "$0")"

rsync -az --delete --exclude .DS_Store caddy/ "$HOST:/srv/caddy/"
ssh "$HOST" 'cd /srv/caddy \
  && docker compose up -d --remove-orphans \
  && docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile'
