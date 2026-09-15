#!/usr/bin/env bash
#
# STE-35 (v2) — ship a contract change to a LIVE address, in place.
#
# This is the script that exists because v2 is upgradeable. `deploy-testnet.sh`
# hands out new addresses every time it runs; this one keeps them, which is the
# whole point of having put `upgrade` in. Use it for any change after the v2
# deploy — a new pair of addresses should now be a deliberate decision, not the
# default consequence of editing Rust.
#
#   ER=C… RR=C… bash sc/scripts/upgrade-testnet.sh          # upgrade both
#   RR=C… bash sc/scripts/upgrade-testnet.sh                # upgrade only C2
#
# Addresses default to the v2 pair recorded in docs/deployments.md. Skipping a
# contract whose wasm did not change is not laziness: an upgrade to an identical
# hash still costs a transaction and still writes `contract_upgraded` to the
# ledger, which makes the audit trail claim a code change that did not happen.
#
# BEFORE YOU RUN THIS, read `sc/CLAUDE.md` "v2: kontraknya upgradeable". The new
# code reinterprets the existing storage, and nothing here can check that for
# you: storage keys are append-only forever, and a struct that gained a required
# field cannot decode the values already written under it.
set -euo pipefail

SC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NETWORK="${NETWORK:-testnet}"
ADMIN_ID="${ADMIN_ID:-sterun-admin}"
RUNNER_ID="${RUNNER_ID:-sterun-runner-a}"

ER="${ER:-CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU}"
RR="${RR:-CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW}"

say() { printf '\n=== %s ===\n' "$*"; }
onchain_hash() { stellar contract info hash --contract-id "$1" --network "$NETWORK" 2>/dev/null | tail -1; }

say "build"
(cd "$SC_DIR" && stellar contract build >/dev/null)
shasum -a 256 "$SC_DIR"/target/wasm32v1-none/release/{event_registry,race_record}.wasm

# Upgrade one contract, but only if its wasm actually differs from what is
# running. Prints what it decided and why.
upgrade_one() {
  local label="$1" id="$2" wasm="$3"
  say "$label ($id)"

  local live want
  live="$(onchain_hash "$id")"
  want="$(shasum -a 256 "$wasm" | cut -d' ' -f1)"
  echo "  live  $live"
  echo "  built $want"
  if [ "$live" = "$want" ]; then
    echo "  identical — skipped, so the ledger records no upgrade that did not happen"
    return 0
  fi

  local uploaded
  uploaded="$(stellar contract upload --wasm "$wasm" --source-account "$ADMIN_ID" \
    --network "$NETWORK" --optimize=false 2>/dev/null | tail -1)"
  [ "$uploaded" = "$want" ] || { echo "FAIL: uploaded $uploaded, built $want" >&2; exit 1; }
  echo "  uploaded $uploaded"

  stellar contract invoke --id "$id" --source-account "$ADMIN_ID" --network "$NETWORK" \
    -- upgrade --new_wasm_hash "$uploaded"

  local after
  after="$(onchain_hash "$id")"
  [ "$after" = "$want" ] || { echo "FAIL: after the upgrade the chain reports $after" >&2; exit 1; }
  echo "  now running $after"
}

upgrade_one "EventRegistry" "$ER" "$SC_DIR/target/wasm32v1-none/release/event_registry.wasm"
upgrade_one "RaceRecord"    "$RR" "$SC_DIR/target/wasm32v1-none/release/race_record.wasm"

# --------------------------------------------------------------------------
# The part that matters: the state written by the OLD code still reads.
# --------------------------------------------------------------------------
run() { stellar contract invoke --id "$1" --source-account "$RUNNER_ID" --network "$NETWORK" -- "${@:2}" 2>/dev/null | tail -1; }

say "state written before the upgrade, read after it"
echo "  event 0     $(run "$ER" get_event --event_id 0)"
echo "  category 0  $(run "$ER" get_category --event_id 0 --category_id 0)"
echo "  addon 0     $(run "$ER" get_addon --event_id 0 --addon_id 0)"
echo "  addon_count $(run "$ER" addon_count --event_id 0)"
echo "  record 0    $(run "$RR" record_of --token_id 0)"
echo "  owner_of 0  $(run "$RR" owner_of --token_id 0)"
echo "  supply      $(run "$RR" total_supply)"

say "the non-transferable claim, re-checked on the upgraded code"
moved=$(stellar contract info interface --contract-id "$RR" --network "$NETWORK" 2>/dev/null \
  | grep -cE '^[[:space:]]*fn (transfer|transfer_from|approve|approve_for_all|burn|burn_from)\(' || true)
[ "$moved" -eq 0 ] || { echo "FAIL: the upgraded contract exports $moved transfer-ish function(s)" >&2; exit 1; }
echo "  0 transfer-ish exports"

say "DONE"
echo "EVENT_REGISTRY=$ER  $(onchain_hash "$ER")"
echo "RACE_RECORD=$RR  $(onchain_hash "$RR")"
echo "Record the new wasm hash and the upgrade tx in docs/deployments.md."
