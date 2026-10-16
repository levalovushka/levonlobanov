# levonlobanov.com

Portfolio on the apex, small projects on `<name>.levonlobanov.com`, all served by one Caddy on the `folio` host (see `infra/`). History of changes: `WORKLOG.md`.

## New subproject

Every web page here uses Pragmatica Next as its typeface:

- In `<head>`: `<link rel="stylesheet" href="/_shared/fonts.css">`, plus a preload of `/_shared/fonts/pragmatica-next.woff2` (`as="font" type="font/woff2" crossorigin`) when text is above the fold.
- In CSS: `font-family: var(--font-sans)`. Weights 100–900 and italic come from the one variable font.

A static project lives in `sites/<name>/` and gets a block in `infra/caddy/conf/Caddyfile`:

```
<name>.levonlobanov.com {
	import static /srv/sites/<name>
}
```

The `static` snippet serves `/_shared/` on every site. A project in a container joins the external `web` network and gets `reverse_proxy <service>:<port>` instead; it publishes no ports, because Docker-published ports bypass ufw.

Local dev mirrors production: `python3 infra/serve.py sites/<name> <port>` serves the site plus `/_shared/`.

## Fonts are licensed

The repo is public; Pragmatica Next (ParaType) binaries stay out of git. `infra/build-fonts.sh` builds `shared/fonts/*.woff2` from `~/Library/Fonts`; `infra/deploy.sh` uploads them and refuses to run without them.

## Deploy

`./infra/deploy.sh` syncs `shared/`, `sites/` and `infra/caddy/` to the server and reloads Caddy. A new subdomain needs no DNS change (wildcard `A`); Caddy issues its certificate on first deploy.
