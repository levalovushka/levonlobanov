#!/usr/bin/env bash
# Build the shared web fonts from the locally installed Pragmatica Next VF.
# Output: shared/fonts/*.woff2 — gitignored, because the font is licensed
# and the repo is public. deploy.sh uploads them to the server.
#
# Each file: width axis pinned to 100, weight axis 100–900 kept,
# subset to Latin, Cyrillic and common punctuation/symbols.
set -euo pipefail

cd "$(dirname "$0")"
SRC="${FONT_DIR:-$HOME/Library/Fonts}"
OUT=../shared/fonts
VENV=.venv
UNICODES="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2000-206F,U+20AC,U+20BD,U+2116,U+2122,U+2190-2193,U+2212,U+2215"

if [ ! -x "$VENV/bin/pyftsubset" ]; then
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q fonttools brotli
fi

mkdir -p "$OUT"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

build() {
  local src="$SRC/$1" name="$2"
  "$VENV/bin/fonttools" varLib.instancer "$src" wdth=100 -q -o "$tmp/$name.ttf"
  # `meta` table can't be subset and is dropped; that warning is expected.
  "$VENV/bin/pyftsubset" "$tmp/$name.ttf" --unicodes="$UNICODES" \
    --layout-features='*' --flavor=woff2 --output-file="$OUT/$name.woff2" 2>&1 \
    | grep -v "meta NOT subset" || true
  echo "$OUT/$name.woff2 $(( $(wc -c < "$OUT/$name.woff2") / 1024 )) KB"
}

build pragmatica-next_vf.ttf pragmatica-next
build pragmatica-next_vf-slanted.ttf pragmatica-next-slanted
