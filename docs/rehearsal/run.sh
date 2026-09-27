#!/usr/bin/env bash
# STE-25 — run the mock race against live testnet and the live backend.
#
#   docs/rehearsal/run.sh                 # evidence in docs/rehearsal/runs/<UTC time>/
#   STERUN_API_URL=http://127.0.0.1:3001 docs/rehearsal/run.sh
#
# Needs: Node >= 22, pnpm, network access, and STERUN_ADMIN_SECRET (testnet) in
# the repo-root .env or the environment. Every other account is created fresh.
# Takes 15-20 minutes: roughly 90 transactions, each waiting for its ledger,
# plus up to a minute of real waiting in F.1 (a QR screenshot going stale).
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

# Each bundle is written inside the package whose node_modules it must resolve
# from: the desks import the web app (fe/), the stage manager imports be/.
FE_OUT="fe/node_modules/.cache/sterun-rehearsal"
BE_OUT="be/node_modules/.cache/sterun-rehearsal"
mkdir -p "$FE_OUT" "$BE_OUT"
"$ESBUILD" docs/rehearsal/src/device.ts --bundle --platform=node --format=esm --packages=external \
  --alias:next/link=next/link.js --tsconfig=fe/tsconfig.json --log-level=warning \
  --outfile="$FE_OUT/device.mjs"
"$ESBUILD" docs/rehearsal/src/mock-race.ts --bundle --platform=node --format=esm --packages=external \
  --log-level=warning --outfile="$BE_OUT/mock-race.mjs"

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
RUN_DIR="${REHEARSAL_RUN_DIR:-docs/rehearsal/runs/$STAMP}"
mkdir -p "$RUN_DIR"

export STERUN_REPO_ROOT="$ROOT"
export REHEARSAL_RUN_DIR="$ROOT/$RUN_DIR"
export REHEARSAL_DEVICE_BUNDLE="$ROOT/$FE_OUT/device.mjs"
export REHEARSAL_GIT="$(git rev-parse --short HEAD)$(git diff --quiet HEAD -- docs/rehearsal/src || echo '+uncommitted')"

set +e
node "$BE_OUT/mock-race.mjs" 2>&1 | tee "$RUN_DIR/run.log"
status=${PIPESTATUS[0]}
set -e

# Last line of defence: no Stellar secret seed may sit in anything this run wrote.
if grep -rEq '\bS[A-Z2-7]{55}\b' "$RUN_DIR"; then
  echo "A secret seed pattern was found in $RUN_DIR. Do not commit it; delete the run directory." >&2
  exit 2
fi

echo "evidence: $RUN_DIR/EVIDENCE.md"
exit "$status"
