#!/usr/bin/env bash
#
# STE-33 (C3) — deploy EventRegistry + RaceRecord to Stellar testnet, wire them
# together, and prove on-chain that the result works.
#
# This script exists so the deployment is auditable and repeatable rather than a
# sequence somebody once typed. It is the script that produced the addresses
# recorded in docs/deployments.md; running it again produces NEW contract
# addresses (deploy uses a random salt), so run it only when you actually intend
# to deploy a fresh pair.
#
#   bash sc/scripts/deploy-testnet.sh              # deploy + wire + sanity check
#   SKIP_SANITY=1 bash sc/scripts/deploy-testnet.sh  # deploy + wire only
#
# Requires: stellar CLI 27.x, a built wasm (the script builds it), and the sUSD
# SAC from STE-30 already live (it is — see docs/deployments.md).
#
# Two deliberate choices worth knowing before you edit this:
#
#   * `upload` then `deploy --wasm-hash`, not `deploy --wasm`. Uploading first
#     prints the hash that actually landed on the ledger, so the hash recorded
#     in docs/deployments.md is read off the chain rather than off a local file.
#     `--optimize=false` keeps the uploaded bytes identical to the artifact the
#     bindings and docs/specs/INTERFACE.md §0 were derived from.
#   * The sanity check runs the NEGATIVE cases too. A deploy that only proves
#     the happy path has not proven that the guards survived the trip to a real
#     network — and the guards are the product.
set -euo pipefail

SC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NETWORK="${NETWORK:-testnet}"

# STE-30. Deterministic from (asset, network passphrase) — see docs/deployments.md.
SAC="${SAC:-CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU}"
ISSUER="${ISSUER:-GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW}"

# Identity aliases. Only the addresses are authoritative; aliases are local.
ADMIN_ID="${ADMIN_ID:-sterun-admin}"
ORG_ID="${ORG_ID:-sterun-organiser}"
RUNNER_ID="${RUNNER_ID:-sterun-runner-a}"
DIST_ID="${DIST_ID:-sterun-susd-distributor}"

# RaceRecord token metadata — same values the unit tests use, so the deployed
# contract and the test suite describe the same thing.
RR_NAME="${RR_NAME:-Sterun Race Record}"
RR_SYMBOL="${RR_SYMBOL:-STERUN}"
RR_BASE_URI="${RR_BASE_URI:-https://sterun.xyz/record/}"

say() { printf '\n=== %s ===\n' "$*"; }

# --------------------------------------------------------------------------
# 0. identities
# --------------------------------------------------------------------------
say "identities"
for id in "$ADMIN_ID" "$ORG_ID" "$RUNNER_ID"; do
  if stellar keys address "$id" >/dev/null 2>&1; then
    echo "  $id  $(stellar keys address "$id")  (exists)"
  else
    stellar keys generate "$id" --network "$NETWORK" --fund >/dev/null
    echo "  $id  $(stellar keys address "$id")  (created + funded)"
  fi
done
ADMIN="$(stellar keys address "$ADMIN_ID")"
ORG="$(stellar keys address "$ORG_ID")"
RUNNER="$(stellar keys address "$RUNNER_ID")"

# --------------------------------------------------------------------------
# 1. build + upload
# --------------------------------------------------------------------------
say "build"
(cd "$SC_DIR" && stellar contract build >/dev/null)
ER_WASM="$SC_DIR/target/wasm32v1-none/release/event_registry.wasm"
RR_WASM="$SC_DIR/target/wasm32v1-none/release/race_record.wasm"
shasum -a 256 "$ER_WASM" "$RR_WASM"

say "upload wasm (hash printed is what landed on the ledger)"
ER_HASH="$(stellar contract upload --wasm "$ER_WASM" --source-account "$ADMIN_ID" \
  --network "$NETWORK" --optimize=false 2>/dev/null | tail -1)"
RR_HASH="$(stellar contract upload --wasm "$RR_WASM" --source-account "$ADMIN_ID" \
  --network "$NETWORK" --optimize=false 2>/dev/null | tail -1)"
echo "  event_registry $ER_HASH"
echo "  race_record    $RR_HASH"

# --------------------------------------------------------------------------
# 2. deploy
# --------------------------------------------------------------------------
say "deploy EventRegistry"
ER="$(stellar contract deploy --wasm-hash "$ER_HASH" --source-account "$ADMIN_ID" \
  --network "$NETWORK" --alias sterun-event-registry \
  -- --admin "$ADMIN" 2>/dev/null | tail -1)"
echo "  $ER"

say "deploy RaceRecord (token address is a constructor arg: sUSD here, USDC on mainnet)"
RR="$(stellar contract deploy --wasm-hash "$RR_HASH" --source-account "$ADMIN_ID" \
  --network "$NETWORK" --alias sterun-race-record \
  -- --admin "$ADMIN" --registry "$ER" --token "$SAC" \
     --name "$RR_NAME" --symbol "$RR_SYMBOL" --base_uri "$RR_BASE_URI" 2>/dev/null | tail -1)"
echo "  $RR"

# --------------------------------------------------------------------------
# 3. wiring — one shot, and never re-settable
# --------------------------------------------------------------------------
say "wire set_race_record (admin only, rejects a second call forever after)"
stellar contract invoke --id "$ER" --source-account "$ADMIN_ID" --network "$NETWORK" \
  -- set_race_record --race_record "$RR" >/dev/null
inv() { stellar contract invoke --id "$1" --source-account "$ADMIN_ID" --network "$NETWORK" -- "${@:2}" 2>/dev/null | tail -1; }
echo "  EventRegistry.get_admin        $(inv "$ER" get_admin)"
echo "  EventRegistry.get_race_record  $(inv "$ER" get_race_record)"
echo "  RaceRecord.get_registry        $(inv "$RR" get_registry)"
echo "  RaceRecord.get_token           $(inv "$RR" get_token)"

say "on-chain wasm hash of the deployed instances"
echo "  EventRegistry $(stellar contract info hash --contract-id "$ER" --network "$NETWORK" 2>/dev/null | tail -1)"
echo "  RaceRecord    $(stellar contract info hash --contract-id "$RR" --network "$NETWORK" 2>/dev/null | tail -1)"

say "live RaceRecord exports nothing that could move a record"
moved=$(stellar contract info interface --contract-id "$RR" --network "$NETWORK" 2>/dev/null \
  | grep -cE '^[[:space:]]*fn (transfer|transfer_from|approve|approve_for_all|burn|burn_from)\(' || true)
[ "$moved" -eq 0 ] || { echo "FAIL: live contract exports $moved transfer-ish function(s)" >&2; exit 1; }
echo "  0 of transfer/transfer_from/approve/approve_for_all/burn/burn_from — checked against the live network"

echo
echo "EVENT_REGISTRY=$ER"
echo "RACE_RECORD=$RR"
echo "SUSD_SAC=$SAC"

[ "${SKIP_SANITY:-0}" = "1" ] && exit 0

# --------------------------------------------------------------------------
# 4. sanity check on the real network — positive AND negative
# --------------------------------------------------------------------------
org() { stellar contract invoke --id "$1" --source-account "$ORG_ID" --network "$NETWORK" -- "${@:2}" 2>/dev/null | tail -1; }
run() { stellar contract invoke --id "$1" --source-account "$RUNNER_ID" --network "$NETWORK" -- "${@:2}" 2>/dev/null | tail -1; }
# Expect a specific contract error code; the band tells you which contract it
# came from (1..=99 EventRegistry, 100..=199 RaceRecord, 200+ OpenZeppelin).
expect_err() {
  local want="$1"; shift
  if "$@" >/dev/null 2>/tmp/sterun-deploy-err.$$; then
    echo "FAIL: expected Error(Contract, #$want) but the call succeeded" >&2; exit 1
  fi
  grep -q "Error(Contract, #$want)" /tmp/sterun-deploy-err.$$ \
    || { echo "FAIL: expected #$want, got:" >&2; tail -3 /tmp/sterun-deploy-err.$$ >&2; exit 1; }
  rm -f /tmp/sterun-deploy-err.$$
  echo "  reverted with #$want, as designed"
}

say "sanity: create_event -> add_category -> Open"
MH="$(printf 'sterun-testnet-sanity-%s' "$(date -u +%Y-%m-%d)" | shasum -a 256 | cut -d' ' -f1)"
EVENT_ID="$(org "$ER" create_event --organiser "$ORG" --name "Sterun Testnet Rehearsal" \
  --metadata_hash "$MH" --uri "https://sterun.xyz/events/sanity.json" --starts_at 1789000000)"
CATEGORY_ID="$(org "$ER" add_category --event_id "$EVENT_ID" --code 10K --distance_m 10000 --quota 5 --price_usdc 50000000)"
org "$ER" set_event_status --event_id "$EVENT_ID" --status Open >/dev/null
echo "  event_id=$EVENT_ID category_id=$CATEGORY_ID quota=5 price=5 sUSD"

say "sanity: trustlines + fund the runner with sUSD"
for id in "$RUNNER_ID" "$ORG_ID"; do
  stellar tx new change-trust --source-account "$id" --line "sUSD:$ISSUER" --network "$NETWORK" >/dev/null 2>&1 || true
done
stellar contract invoke --id "$SAC" --source-account "$DIST_ID" --network "$NETWORK" \
  -- transfer --from "$(stellar keys address "$DIST_ID")" --to "$RUNNER" --amount 500000000 >/dev/null
echo "  runner holds $(run "$SAC" balance --id "$RUNNER") stroops of sUSD"

# The frozen emission order (INTERFACE.md §2.3) is visible in this call's event
# log: slot_reserved (registry) -> transfer (SAC) -> mint -> record_entered.
say "sanity: enter — one invocation, quota + payment + mint"
PH=feb3cea959e59a1f5a42e9bac1f36e0fccc266de05960e173226fcadfd63fe29  # vector ph-04
TOKEN_ID="$(run "$RR" enter --runner "$RUNNER" --event_id "$EVENT_ID" --category_id "$CATEGORY_ID" --participant_hash "$PH")"
echo "  token_id=$TOKEN_ID"
echo "  record_of  $(run "$RR" record_of --token_id "$TOKEN_ID")"
echo "  verify(correct hash) $(run "$RR" verify --token_id "$TOKEN_ID" --participant_hash "$PH")"
echo "  verify(wrong hash)   $(run "$RR" verify --token_id "$TOKEN_ID" --participant_hash 0000000000000000000000000000000000000000000000000000000000000000)"
echo "  runner sUSD    $(run "$SAC" balance --id "$RUNNER")"
echo "  organiser sUSD $(run "$SAC" balance --id "$ORG")"

say "sanity (negative): the guards still hold on a real network"
echo -n "  record_finish before the racepack is claimed: "
expect_err 103 stellar contract invoke --id "$RR" --source-account "$ORG_ID" --network "$NETWORK" \
  -- record_finish --token_id "$TOKEN_ID" --finish_time_s 3000
echo -n "  set_race_record a second time: "
expect_err 7 stellar contract invoke --id "$ER" --source-account "$ADMIN_ID" --network "$NETWORK" \
  -- set_race_record --race_record "$RR"

say "sanity: claim_racepack -> finish, and the double-claim guard"
org "$RR" claim_racepack --token_id "$TOKEN_ID" --operator "$ORG" >/dev/null
echo "  claimed"
echo -n "  claim_racepack a second time: "
expect_err 102 stellar contract invoke --id "$RR" --source-account "$ORG_ID" --network "$NETWORK" \
  -- claim_racepack --token_id "$TOKEN_ID" --operator "$ORG"
org "$RR" record_finish --token_id "$TOKEN_ID" --finish_time_s 3161 >/dev/null
echo "  record_of  $(run "$RR" record_of --token_id "$TOKEN_ID")"

say "DONE"
echo "EVENT_REGISTRY=$ER"
echo "RACE_RECORD=$RR"
echo "Record the addresses, the on-chain wasm hashes and the tx links in docs/deployments.md."
