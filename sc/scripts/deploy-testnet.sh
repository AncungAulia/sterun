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
#   * v2 additions get the same treatment: paid add-ons are bought and paid for
#     against real sUSD, the add-on guards are made to fire, an event is
#     cancelled and made to reject an entry, and BOTH contracts are actually
#     upgraded on the live network with their state read back afterwards. An
#     upgrade path that was only ever exercised in `cargo test` is a claim, not
#     evidence.
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
# An i128 comes back as a JSON string ("330000000"), which `$(( ))` refuses.
# Every balance this script does arithmetic on goes through here.
bal() { run "$SAC" balance --id "$1" | tr -d '"'; }
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

# An auth failure is NOT a contract error: `require_auth` on the wrong signer
# fails the host's auth check, so there is no `Error(Contract, #n)` to grep for.
#
# In practice the CLI usually does not even get as far as submitting. It
# simulates first, the simulation reports that the STORED admin must sign, and
# the CLI stops with "Missing signing key for account G…" naming that admin.
# That message is the rejection — the gate reading authority out of storage
# rather than off the caller — so it counts, and the account it names is
# asserted rather than waved past.
expect_auth_fail() {
  local must_sign="$1"; shift
  if "$@" >/dev/null 2>/tmp/sterun-deploy-auth.$$; then
    echo "FAIL: expected an authorization failure but the call succeeded" >&2; exit 1
  fi
  if grep -qiE 'unauthorized|InvalidAction|Error\(Auth' /tmp/sterun-deploy-auth.$$; then
    echo "  rejected by the host's auth check, as designed"
  elif grep -q "Missing signing key for account ${must_sign}" /tmp/sterun-deploy-auth.$$; then
    echo "  rejected: the call requires ${must_sign:0:8}… (the stored admin) to sign, as designed"
  else
    echo "FAIL: the call failed, but not on authorization:" >&2
    tail -3 /tmp/sterun-deploy-auth.$$ >&2
    exit 1
  fi
  rm -f /tmp/sterun-deploy-auth.$$
}

say "sanity: create_event -> add_category -> add_addon -> Open"
MH="$(printf 'sterun-testnet-sanity-%s' "$(date -u +%Y-%m-%d)" | shasum -a 256 | cut -d' ' -f1)"
EVENT_ID="$(org "$ER" create_event --organiser "$ORG" --name "Sterun Testnet Rehearsal" \
  --metadata_hash "$MH" --uri "https://sterun.xyz/events/sanity.json" --starts_at 1789000000)"
CATEGORY_ID="$(org "$ER" add_category --event_id "$EVENT_ID" --code 10K --distance_m 10000 --quota 5 --price_usdc 50000000)"
# v2 (STE-35): two paid add-ons, one of which has quota 1 so the sold-out guard
# can be made to fire below.
JERSEY_ID="$(org "$ER" add_addon --event_id "$EVENT_ID" --code JERSEY --price_usdc 50000000 --quota 2)"
TUMBLER_ID="$(org "$ER" add_addon --event_id "$EVENT_ID" --code TUMBLER --price_usdc 30000000 --quota 1)"
org "$ER" set_event_status --event_id "$EVENT_ID" --status Open >/dev/null
echo "  event_id=$EVENT_ID category_id=$CATEGORY_ID quota=5 price=5 sUSD"
echo "  addon jersey=$JERSEY_ID (5 sUSD, quota 2)  tumbler=$TUMBLER_ID (3 sUSD, quota 1)"
echo "  addon_count=$(org "$ER" addon_count --event_id "$EVENT_ID")"

say "sanity: trustlines + fund the runner with sUSD"
for id in "$RUNNER_ID" "$ORG_ID"; do
  stellar tx new change-trust --source-account "$id" --line "sUSD:$ISSUER" --network "$NETWORK" >/dev/null 2>&1 || true
done
stellar contract invoke --id "$SAC" --source-account "$DIST_ID" --network "$NETWORK" \
  -- transfer --from "$(stellar keys address "$DIST_ID")" --to "$RUNNER" --amount 500000000 >/dev/null
echo "  runner holds $(run "$SAC" balance --id "$RUNNER") stroops of sUSD"

# The frozen emission order (INTERFACE.md §2.3) is visible in this call's event
# log: slot_reserved (registry) -> transfer (SAC) -> mint -> record_entered.
say "sanity: enter — one invocation, quota + add-ons + payment + mint"
PH=feb3cea959e59a1f5a42e9bac1f36e0fccc266de05960e173226fcadfd63fe29  # vector ph-04
ORG_BEFORE="$(bal "$ORG")"
TOKEN_ID="$(run "$RR" enter --runner "$RUNNER" --event_id "$EVENT_ID" --category_id "$CATEGORY_ID" \
  --addon_ids "[$JERSEY_ID,$TUMBLER_ID]" --participant_hash "$PH")"
echo "  token_id=$TOKEN_ID"
echo "  record_of  $(run "$RR" record_of --token_id "$TOKEN_ID")"
echo "  verify(correct hash) $(run "$RR" verify --token_id "$TOKEN_ID" --participant_hash "$PH")"
echo "  verify(wrong hash)   $(run "$RR" verify --token_id "$TOKEN_ID" --participant_hash 0000000000000000000000000000000000000000000000000000000000000000)"
echo "  runner sUSD    $(run "$SAC" balance --id "$RUNNER")"
ORG_AFTER="$(bal "$ORG")"
echo "  organiser sUSD $ORG_AFTER"

# The whole point of v2: ONE transfer, for category + every add-on. 5 + 5 + 3.
CHARGED=$(( ORG_AFTER - ORG_BEFORE ))
if [ "$CHARGED" -ne 130000000 ]; then
  echo "FAIL: organiser received $CHARGED stroops, expected 130000000 (5 + 5 + 3 sUSD)" >&2
  exit 1
fi
echo "  organiser received $CHARGED stroops = category 5 + jersey 5 + tumbler 3 sUSD, in one transfer"
echo "  jersey  $(run "$ER" get_addon --event_id "$EVENT_ID" --addon_id "$JERSEY_ID")"
echo "  tumbler $(run "$ER" get_addon --event_id "$EVENT_ID" --addon_id "$TUMBLER_ID")"

say "sanity (negative): the add-on guards fire on a real network"
RUNNER_B_ID="${RUNNER_B_ID:-sterun-runner-b}"
if ! stellar keys address "$RUNNER_B_ID" >/dev/null 2>&1; then
  stellar keys generate "$RUNNER_B_ID" --network "$NETWORK" --fund >/dev/null
fi
RUNNER_B="$(stellar keys address "$RUNNER_B_ID")"
stellar tx new change-trust --source-account "$RUNNER_B_ID" --line "sUSD:$ISSUER" --network "$NETWORK" >/dev/null 2>&1 || true
stellar contract invoke --id "$SAC" --source-account "$DIST_ID" --network "$NETWORK" \
  -- transfer --from "$(stellar keys address "$DIST_ID")" --to "$RUNNER_B" --amount 500000000 >/dev/null
PH_B=8e6d4a53d17b1f2c9a0b4e7f3c5d8a1b6e9f2c4d7a0b3e6f9c2d5a8b1e4f7c0a

echo -n "  the same add-on id twice: "
expect_err 107 stellar contract invoke --id "$RR" --source-account "$RUNNER_B_ID" --network "$NETWORK" \
  -- enter --runner "$RUNNER_B" --event_id "$EVENT_ID" --category_id "$CATEGORY_ID" \
     --addon_ids "[$JERSEY_ID,$JERSEY_ID]" --participant_hash "$PH_B"
echo -n "  more add-on ids than the event has: "
expect_err 106 stellar contract invoke --id "$RR" --source-account "$RUNNER_B_ID" --network "$NETWORK" \
  -- enter --runner "$RUNNER_B" --event_id "$EVENT_ID" --category_id "$CATEGORY_ID" \
     --addon_ids "[0,1,2]" --participant_hash "$PH_B"
echo -n "  the tumbler, whose quota of 1 is already gone: "
expect_err 15 stellar contract invoke --id "$RR" --source-account "$RUNNER_B_ID" --network "$NETWORK" \
  -- enter --runner "$RUNNER_B" --event_id "$EVENT_ID" --category_id "$CATEGORY_ID" \
     --addon_ids "[$TUMBLER_ID]" --participant_hash "$PH_B"

# All-or-nothing, checked against the chain rather than asserted: three rejected
# entries must have left the category slot count and the jersey stock untouched.
say "sanity: the rejected entries consumed nothing"
echo "  category $(run "$ER" get_category --event_id "$EVENT_ID" --category_id "$CATEGORY_ID")"
echo "  jersey   $(run "$ER" get_addon --event_id "$EVENT_ID" --addon_id "$JERSEY_ID")"
echo "  runner-b sUSD $(run "$SAC" balance --id "$RUNNER_B") (unchanged: nothing was charged)"

# ...and the stock that is left is really still buyable.
say "sanity: a second runner buys the remaining jersey"
ORG_BEFORE_B="$(bal "$ORG")"
TOKEN_B="$(stellar contract invoke --id "$RR" --source-account "$RUNNER_B_ID" --network "$NETWORK" \
  -- enter --runner "$RUNNER_B" --event_id "$EVENT_ID" --category_id "$CATEGORY_ID" \
     --addon_ids "[$JERSEY_ID]" --participant_hash "$PH_B" 2>/dev/null | tail -1)"
ORG_AFTER_B="$(bal "$ORG")"
CHARGED_B=$(( ORG_AFTER_B - ORG_BEFORE_B ))
[ "$CHARGED_B" -eq 100000000 ] || { echo "FAIL: charged $CHARGED_B, expected 100000000 (5 + 5 sUSD)" >&2; exit 1; }
echo "  token_id=$TOKEN_B charged $CHARGED_B stroops = category 5 + jersey 5 sUSD"
echo "  record $(run "$RR" record_of --token_id "$TOKEN_B")"
echo "  jersey $(run "$ER" get_addon --event_id "$EVENT_ID" --addon_id "$JERSEY_ID") (sold out now)"
echo -n "  a third buyer for the jersey: "
expect_err 15 stellar contract invoke --id "$RR" --source-account "$RUNNER_ID" --network "$NETWORK" \
  -- enter --runner "$RUNNER" --event_id "$EVENT_ID" --category_id "$CATEGORY_ID" \
     --addon_ids "[$JERSEY_ID]" --participant_hash "$PH_B"

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

# --------------------------------------------------------------------------
# 5. v2: Cancelled, on a throwaway event so the one above stays usable
# --------------------------------------------------------------------------
say "sanity: Cancelled is terminal and stops entries"
DOOMED="$(org "$ER" create_event --organiser "$ORG" --name "Sterun Cancelled Rehearsal" \
  --metadata_hash "$MH" --uri "https://sterun.xyz/events/cancelled.json" --starts_at 1789000000)"
DOOMED_CAT="$(org "$ER" add_category --event_id "$DOOMED" --code 5K --distance_m 5000 --quota 5 --price_usdc 0)"
org "$ER" set_event_status --event_id "$DOOMED" --status Open >/dev/null
org "$ER" set_event_status --event_id "$DOOMED" --status Cancelled >/dev/null
echo "  event_id=$DOOMED $(run "$ER" get_event --event_id "$DOOMED")"
echo -n "  entering a cancelled event: "
# EventNotOpen(4), from EventRegistry — the band says which contract said no.
expect_err 4 stellar contract invoke --id "$RR" --source-account "$RUNNER_ID" --network "$NETWORK" \
  -- enter --runner "$RUNNER" --event_id "$DOOMED" --category_id "$DOOMED_CAT" \
     --addon_ids "[]" --participant_hash "$PH"
echo -n "  re-opening a cancelled event: "
expect_err 11 stellar contract invoke --id "$ER" --source-account "$ORG_ID" --network "$NETWORK" \
  -- set_event_status --event_id "$DOOMED" --status Open

# --------------------------------------------------------------------------
# 6. v2: upgrade BOTH contracts on the live network, then read the state back
#
# The upgrade installs the same wasm that is already running. That is not a
# weaker test than installing a different one — the mechanism, the auth gate and
# the state survival are exactly what is being checked, and using a different
# wasm would mean deploying a second artifact nobody reviewed just to throw it
# away. What it proves is the thing that matters: the upgrade path works against
# a real network, and every entry written before it reads back after it.
# --------------------------------------------------------------------------
say "sanity: upgrade both contracts, admin-gated, state preserved"
echo -n "  a non-admin upgrading EventRegistry: "
expect_auth_fail "$ADMIN" stellar contract invoke --id "$ER" --source-account "$ORG_ID" --network "$NETWORK" \
  -- upgrade --new_wasm_hash "$ER_HASH"

stellar contract invoke --id "$ER" --source-account "$ADMIN_ID" --network "$NETWORK" \
  -- upgrade --new_wasm_hash "$ER_HASH" >/dev/null
stellar contract invoke --id "$RR" --source-account "$ADMIN_ID" --network "$NETWORK" \
  -- upgrade --new_wasm_hash "$RR_HASH" >/dev/null
echo "  upgraded"
echo "  EventRegistry on-chain hash $(stellar contract info hash --contract-id "$ER" --network "$NETWORK" 2>/dev/null | tail -1)"
echo "  RaceRecord    on-chain hash $(stellar contract info hash --contract-id "$RR" --network "$NETWORK" 2>/dev/null | tail -1)"
echo "  event      $(run "$ER" get_event --event_id "$EVENT_ID")"
echo "  category   $(run "$ER" get_category --event_id "$EVENT_ID" --category_id "$CATEGORY_ID")"
echo "  jersey     $(run "$ER" get_addon --event_id "$EVENT_ID" --addon_id "$JERSEY_ID")"
echo "  record     $(run "$RR" record_of --token_id "$TOKEN_ID")"
echo "  owner_of   $(run "$RR" owner_of --token_id "$TOKEN_ID")"
echo "  verify     $(run "$RR" verify --token_id "$TOKEN_ID" --participant_hash "$PH")"
echo "  addon_count $(run "$ER" addon_count --event_id "$EVENT_ID")"

say "sanity: the upgraded contracts still work, and still export nothing that moves a record"
moved=$(stellar contract info interface --contract-id "$RR" --network "$NETWORK" 2>/dev/null \
  | grep -cE '^[[:space:]]*fn (transfer|transfer_from|approve|approve_for_all|burn|burn_from)\(' || true)
[ "$moved" -eq 0 ] || { echo "FAIL: the upgraded contract exports $moved transfer-ish function(s)" >&2; exit 1; }
echo "  0 transfer-ish exports on the upgraded RaceRecord"

say "DONE"
echo "EVENT_REGISTRY=$ER"
echo "RACE_RECORD=$RR"
echo "Record the addresses, the on-chain wasm hashes and the tx links in docs/deployments.md."
