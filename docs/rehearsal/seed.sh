#!/usr/bin/env bash
# STE-68 — seed the live testnet demo: four races with a document and a poster
# each, 25 records, one race already run with finish times, and the SOW's two
# fraud attempts at its pack desks. Takes the sc/ sanity races off the
# directory first.
#
#   docs/rehearsal/seed.sh                 # sweep + seed; evidence in docs/rehearsal/runs/<UTC time>-seed/
#   docs/rehearsal/seed.sh --sweep-only    # only cancel the sc/ sanity races
#   docs/rehearsal/seed.sh --no-sweep      # seed without the sweep
#   STERUN_API_URL=http://127.0.0.1:3001 docs/rehearsal/seed.sh
#
# Needs: Node >= 22, pnpm, network access, and in the repo-root .env:
#   STERUN_ADMIN_SECRET            to allowlist the demo organiser (first run only)
#   STERUN_DEMO_ORGANISER_SECRET   written there by the first run; reused after
# and for the sweep, the `sterun-organiser` stellar CLI identity (or
# STERUN_SANITY_ORGANISER_SECRET). Uses 16 of the faucet's 100 payouts a day.
# Takes 20-25 minutes, including up to a minute of real waiting in F.1.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [ ! -d node_modules/.pnpm ]; then
  pnpm install --frozen-lockfile
fi
if [ ! -f sdk/dist/index.js ]; then
  pnpm --filter @sterunxyz/sdk build
fi

ESBUILD="$(ls -d node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild 2>/dev/null | tail -1)"
if [ -z "$ESBUILD" ]; then
  echo "esbuild not found under node_modules/.pnpm (it arrives with tsx); run pnpm install" >&2
  exit 1
fi

# As run.sh: each bundle sits inside the package whose node_modules it resolves
# from. The seed imports the console's document writer from fe/, whose `@/`
# paths esbuild resolves through fe/tsconfig.json.
FE_OUT="fe/node_modules/.cache/sterun-rehearsal"
BE_OUT="be/node_modules/.cache/sterun-rehearsal"
mkdir -p "$FE_OUT" "$BE_OUT"
"$ESBUILD" docs/rehearsal/src/device.ts --bundle --platform=node --format=esm --packages=external \
  --alias:next/link=next/link.js --tsconfig=fe/tsconfig.json --log-level=warning \
  --outfile="$FE_OUT/device.mjs"
"$ESBUILD" docs/rehearsal/src/seed.ts --bundle --platform=node --format=esm --packages=external \
  --tsconfig=fe/tsconfig.json --log-level=warning --outfile="$BE_OUT/seed.mjs"

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
RUN_DIR="${REHEARSAL_RUN_DIR:-docs/rehearsal/runs/$STAMP-seed}"
mkdir -p "$RUN_DIR"

export STERUN_REPO_ROOT="$ROOT"
export REHEARSAL_RUN_DIR="$ROOT/$RUN_DIR"
export REHEARSAL_DEVICE_BUNDLE="$ROOT/$FE_OUT/device.mjs"
export REHEARSAL_GIT="$(git rev-parse --short HEAD)$(git diff --quiet HEAD -- docs/rehearsal/src || echo '+uncommitted')"

set +e
node "$BE_OUT/seed.mjs" "$@" 2>&1 | tee "$RUN_DIR/run.log"
status=${PIPESTATUS[0]}
set -e

# Last line of defence: no Stellar secret seed may sit in anything this run wrote.
if grep -rEq '\bS[A-Z2-7]{55}\b' "$RUN_DIR"; then
  echo "A secret seed pattern was found in $RUN_DIR. Do not commit it; delete the run directory." >&2
  exit 2
fi

echo "evidence: $RUN_DIR/EVIDENCE.md"
exit "$status"
