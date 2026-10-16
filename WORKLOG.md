# Worklog

## 2026-10-16 — Pragmatica Next as the shared site font

- **What:** `infra/build-fonts.sh` builds `shared/fonts/pragmatica-next{,-slanted}.woff2` (165 / 137 KB) from `~/Library/Fonts` (fontTools in `infra/.venv`). `shared/fonts.css` defines `"Pragmatica Next"` (wght 100–900, normal + italic) and `--font-sans`. Caddyfile: snippet `static` serves `/_shared/*` from `/srv/shared` (fonts cached 30 days) on apex and mosaic; compose mounts `/srv/shared`; `deploy.sh` syncs `shared/` and refuses to run without built fonts. Mosaic and the apex placeholder use `var(--font-sans)`. `infra/serve.py` + `.claude/launch.json` (root and Mosaic's) give the same `/_shared/` layout locally. `CLAUDE.md` makes this the convention for new projects.
- **Why:** one typeface across all subprojects, set up once. The width axis is pinned to 100 and glyphs subset to Latin + Cyrillic: 767 → 165 KB. Font binaries are gitignored (ParaType EULA, public repo); same-origin serving without CORS keeps other sites from using them. User confirmed the web licence.
- **Verified:** built fonts keep `wght` 100–900, have Ж, ₽, —. `./infra/deploy.sh` exit 0. On server: fonts.css 200 on both hosts, woff2 200 `font/woff2` with `max-age=2592000`, no `Access-Control-Allow-Origin`; `/_shared/../` traversal → 404. Browser: mosaic.levonlobanov.com and local `serve.py` both load "Pragmatica Next", no console errors; a cross-origin `FontFace` load from localhost fails with NetworkError.
- **Left:** a fresh clone needs the font installed locally before `build-fonts.sh`/deploy work. Not pushed.

## 2026-10-16 — Mosaic on mosaic.levonlobanov.com

- **What:** Mosaic (static WebGL tool, no build) copied from its Claude scratch workspace into `sites/mosaic/` (source files, `assets/runner.webp`, its WORKLOG and launch.json minus the stale `mosaic-dist` entry). `compose.yaml` mounts `/srv/sites` read-only; `Caddyfile` serves `mosaic.levonlobanov.com` from `/srv/sites/mosaic`; `deploy.sh` also rsyncs `sites/` → `/srv/sites/`, skipping `.claude` and `WORKLOG.md`.
- **Why:** first subdomain project. Static sites go straight to Caddy's file_server — no container per site. Test clips (incl. the user's own clip), koi reference, `dist/` and the zip were left out: private or redundant (`dist/` was a byte-identical copy).
- **Verified:** `./infra/deploy.sh` exit 0; Let's Encrypt cert obtained for mosaic; `/`, three JS modules, `runner.webp` → 200 (JS/HTML zstd); `/WORKLOG.md`, `/.claude/launch.json` → 404; strict TLS from the Mac → 200 verify=0. Browser pane: page "Mosaic Shader" renders the mosaic, 1 canvas, 18 sliders, no console errors.
- **Left:** source of truth is now `sites/mosaic/`; the scratch workspace copy is untouched and will drift. Pushed nothing.

## 2026-10-16 — Server bootstrap (Timeweb Cloud, Amsterdam, 194.87.221.121)

- **What:** Ubuntu 24.04 VPS hardened and set up as edge for `levonlobanov.com` + subdomains. Server: user `levon` (key-only, NOPASSWD sudo, docker group); `/etc/ssh/sshd_config.d/00-hardening.conf` (no root, no passwords); ufw allows only 22/tcp, 80/tcp, 443/tcp+udp; 2 GB `/swapfile`, swappiness 10; Docker 29.9.1 + compose v5.6.0 from Docker's apt repo, log rotation in `/etc/docker/daemon.json`; Caddy 2.11 in `/srv/caddy` on shared network `web`. Repo: `infra/caddy/{compose.yaml,conf/Caddyfile,site/index.html}`, `infra/deploy.sh`, `.gitignore`. Local: `Host folio` in `~/.ssh/config` (backup `~/.ssh/config.bak-folio`).
- **Why:** one small VPS hosts the portfolio on the apex and pet projects on `*.levonlobanov.com`; Amsterdam so Claude API and foreign visitors work without proxies. Caddy gives automatic TLS per subdomain; projects attach to `web` instead of publishing ports, because Docker-published ports bypass ufw.
- **Verified:** `ssh folio` works, root and password logins return `Permission denied (publickey)`; `ufw status` active; `caddy validate` → Valid configuration; Let's Encrypt certs obtained for apex and www; `curl --resolve levonlobanov.com:443:194.87.221.121 https://levonlobanov.com/` → 200, verify=0; www → 301 to apex.
- **Left:** AAAA records (`2a03:6f02::a3cd`) not in DNS yet. Port closure (e.g. 10050 zabbix) not verified from outside — the Mac's network answers on every port. Timeweb panel monitoring may stop since 10050 is now blocked. Nothing committed.
