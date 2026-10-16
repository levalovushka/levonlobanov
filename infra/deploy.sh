#!/usr/bin/env bash
# Sync infra/caddy and sites/ to the server and apply them.
# Needs the `folio` host alias in ~/.ssh/config; override with HOST=...
set -euo pipefail

HOST="${HOST:-folio}"
cd "$(dirname "$0")"

# Project notes and local tooling stay in the repo, not on the web.
rsync -az --delete --delete-excluded \
  --exclude .DS_Store --exclude .claude --exclude WORKLOG.md \
  ../sites/ "$HOST:/srv/sites/"
rsync -az --delete --exclude .DS_Store caddy/ "$HOST:/srv/caddy/"
ssh "$HOST" 'cd /srv/caddy \
  && docker compose up -d --remove-orphans \
  && docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile'
