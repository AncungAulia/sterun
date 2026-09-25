#!/usr/bin/env bash
# STE-68 — render the demo race posters from poster.html into the committed
# JPEGs. Only needed when the design changes; the seed uploads the JPEGs.
#
#   docs/rehearsal/demo/posters/render.sh
#
# Needs Google Chrome (headless) and macOS `sips` for the JPEG conversion.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

render() {
  local key="$1" out="$2"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1600,900 --screenshot="$TMP/$key.png" "file://$HERE/poster.html#$key" >/dev/null 2>&1
  sips -s format jpeg -s formatOptions 84 "$TMP/$key.png" --out "$HERE/$out" >/dev/null
  echo "$out $(wc -c <"$HERE/$out") bytes"
}

render solo solo-heritage-run.jpg
render kotatua kota-tua-10k.jpg
render braga braga-night-run.jpg
render sanur sanur-sunrise-half.jpg
