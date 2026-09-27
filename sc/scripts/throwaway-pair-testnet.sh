#!/usr/bin/env bash
# Deploy a THROWAWAY EventRegistry + RaceRecord pair from this branch's wasm to
# testnet, wire it to the real sUSD SAC, and run one be/ e2e script against it.
#
#   bash sc/scripts/throwaway-pair-testnet.sh e2e:registration-closes   # STE-46
#   bash sc/scripts/throwaway-pair-testnet.sh e2e:record-results        # STE-60
#
# For contract changes that wait on a spec-change PR: the live pair is only
# upgraded after approval, and this proves the new wasm on the real network
# before that without touching it.
#
# The throwaway admin is a fresh keypair funded by Friendbot. Its secret lives in
# this process's environment only (STELLAR_ACCOUNT for the CLI, E2E_ADMIN_SECRET
# for the TypeScript half) and is never printed or written to disk.
set -euo pipefail

E2E="${1:?usage: throwaway-pair-testnet.sh <be e2e script name, e.g. e2e:record-results>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
NETWORK=testnet
SAC="${SAC:-CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU}"
ER_WASM=sc/target/wasm32v1-none/release/event_registry.wasm
RR_WASM=sc/target/wasm32v1-none/release/race_record.wasm

say() { printf '\n=== %s ===\n' "$*"; }

say "build"
(cd sc && stellar contract build >/dev/null 2>&1)
echo "  event_registry.wasm $(sha256sum "$ER_WASM" | cut -c1-64)"
echo "  race_record.wasm    $(sha256sum "$RR_WASM" | cut -c1-64)"

say "throwaway admin"
KEYS="$(node -e 'const {Keypair}=require("@stellar/stellar-sdk");const k=Keypair.random();console.log(k.publicKey()+" "+k.secret())' 2>/dev/null \
  || (cd be && node -e 'import("@stellar/stellar-sdk").then(({Keypair})=>{const k=Keypair.random();console.log(k.publicKey()+" "+k.secret())})'))"
ADMIN="${KEYS%% *}"
export STELLAR_ACCOUNT="${KEYS##* }"
export E2E_ADMIN_SECRET="$STELLAR_ACCOUNT"
unset KEYS
curl -fsS "https://friendbot.stellar.org/?addr=$ADMIN" >/dev/null
echo "  $ADMIN"

say "upload + deploy + wire"
ER_HASH="$(stellar contract upload --wasm "$ER_WASM" --network "$NETWORK" --optimize=false 2>/dev/null | tail -1)"
RR_HASH="$(stellar contract upload --wasm "$RR_WASM" --network "$NETWORK" --optimize=false 2>/dev/null | tail -1)"
ER="$(stellar contract deploy --wasm-hash "$ER_HASH" --network "$NETWORK" -- --admin "$ADMIN" 2>/dev/null | tail -1)"
RR="$(stellar contract deploy --wasm-hash "$RR_HASH" --network "$NETWORK" \
  -- --admin "$ADMIN" --registry "$ER" --token "$SAC" \
     --name "Sterun Race Record" --symbol STERUN --base_uri "https://sterun.xyz/record/" 2>/dev/null | tail -1)"
stellar contract invoke --id "$ER" --network "$NETWORK" -- set_race_record --race_record "$RR" >/dev/null 2>&1
echo "  EventRegistry $ER  (wasm $(stellar contract info hash --contract-id "$ER" --network "$NETWORK" 2>/dev/null | tail -1))"
echo "  RaceRecord    $RR  (wasm $(stellar contract info hash --contract-id "$RR" --network "$NETWORK" 2>/dev/null | tail -1))"
[ "$(stellar contract invoke --id "$ER" --network "$NETWORK" -- get_race_record 2>/dev/null | tr -d '"')" = "$RR" ] \
  || { echo "FAIL: set_race_record did not take" >&2; exit 1; }

say "e2e"
(cd sdk && pnpm build >/dev/null)
E2E_EVENT_REGISTRY="$ER" E2E_RACE_RECORD="$RR" pnpm --filter be "$E2E"
