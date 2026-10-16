# Worklog

## 2026-10-16 — Server bootstrap (Timeweb Cloud, Amsterdam, 194.87.221.121)

- **What:** Ubuntu 24.04 VPS hardened and set up as edge for `levonlobanov.com` + subdomains. Server: user `levon` (key-only, NOPASSWD sudo, docker group); `/etc/ssh/sshd_config.d/00-hardening.conf` (no root, no passwords); ufw allows only 22/tcp, 80/tcp, 443/tcp+udp; 2 GB `/swapfile`, swappiness 10; Docker 29.9.1 + compose v5.6.0 from Docker's apt repo, log rotation in `/etc/docker/daemon.json`; Caddy 2.11 in `/srv/caddy` on shared network `web`. Repo: `infra/caddy/{compose.yaml,conf/Caddyfile,site/index.html}`, `infra/deploy.sh`, `.gitignore`. Local: `Host folio` in `~/.ssh/config` (backup `~/.ssh/config.bak-folio`).
- **Why:** one small VPS hosts the portfolio on the apex and pet projects on `*.levonlobanov.com`; Amsterdam so Claude API and foreign visitors work without proxies. Caddy gives automatic TLS per subdomain; projects attach to `web` instead of publishing ports, because Docker-published ports bypass ufw.
- **Verified:** `ssh folio` works, root and password logins return `Permission denied (publickey)`; `ufw status` active; `caddy validate` → Valid configuration; Let's Encrypt certs obtained for apex and www; `curl --resolve levonlobanov.com:443:194.87.221.121 https://levonlobanov.com/` → 200, verify=0; www → 301 to apex.
- **Left:** AAAA records (`2a03:6f02::a3cd`) not in DNS yet. Port closure (e.g. 10050 zabbix) not verified from outside — the Mac's network answers on every port. Timeweb panel monitoring may stop since 10050 is now blocked. Nothing committed.
