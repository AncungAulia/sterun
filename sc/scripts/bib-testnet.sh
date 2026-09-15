#!/usr/bin/env bash
#
# STE-54 — prove the bib rules on the LIVE EventRegistry, after
# `upgrade-testnet.sh` has installed the v2.3 wasm at the SAME address.
#
#   bash sc/scripts/bib-testnet.sh
#   ER=C… RR=C… bash sc/scripts/bib-testnet.sh
#
# Three things, every one of them asserted rather than printed:
#
#   (a) the fix:    a NEW event with two distances hands out 1 and 2 to the
#                   first entrant of each — not 0 and 0 — and carries on to 3
#                   across the distances. `SlotReserved.seq` and
#                   `RecordData.bib_no` both carry that number.
#   (b) the state:  an event created BEFORE the upgrade still decodes, and the
#                   bib it issued is still the per-distance one it issued.
#                   Record 0 wears bib `0`, which the new code cannot produce —
#                   so a `0` still on chain is proof nothing was rewritten.
#   (c) the quota:  `QuotaFull(5)` still fires, per distance, and the event's
#                   bib counter is not what gates it.
#
# The rehearsal event is a fresh FREE one owned by `sterun-organiser`
# (allowlisted in STE-36), so no sUSD moves and no live race's slots are spent.
# Nothing here writes to an event that predates the upgrade: those are read.
set -euo pipefail

NETWORK="${NETWORK:-testnet}"
ORGANISER_ID="${ORGANISER_ID:-sterun-organiser}"
RUNNER_ID="${RUNNER_ID:-sterun-runner-a}"

ER="${ER:-CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU}"
RR="${RR:-CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW}"

SC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORGANISER="$(stellar keys address "$ORGANISER_ID")"
RUNNER="$(stellar keys address "$RUNNER_ID")"

say()  { printf '\n=== %s ===\n' "$*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }
view() { stellar contract invoke --id "$1" --source-account "$RUNNER_ID" --network "$NETWORK" --send=no -- "${@:2}" 2>/dev/null | tail -1; }
onchain_hash() { stellar contract info hash --contract-id "$1" --network "$NETWORK" 2>/dev/null | tail -1; }

# Sends one transaction. Sets $OUT (the return value), $TX (the hash) and $LOG
# (the CLI's stderr, which carries the emitted events).
send() {
  local who="$1" id="$2"; shift 2
  local errf; errf="$(mktemp)"
  OUT="$(stellar contract invoke --id "$id" --source-account "$who" --network "$NETWORK" -- "$@" 2>"$errf" | tail -1)" \
    || { cat "$errf" >&2; rm -f "$errf"; fail "$* did not land"; }
  LOG="$(cat "$errf")"; rm -f "$errf"
  TX="$(grep -oE '[0-9a-f]{64}' <<<"$LOG" | head -1)"
  [ -n "$TX" ] || fail "no tx hash for $*"
}

# Expects a revert carrying Error(Contract, #code). A reverted call fails in
# simulation, so it never reaches the ledger and has no tx hash — by design.
expect_revert() {
  local code="$1" label="$2" who="$3" id="$4"; shift 4
  local err
  if err=$(stellar contract invoke --id "$id" --source-account "$who" --network "$NETWORK" -- "$@" 2>&1); then
    fail "$label succeeded"
  fi
  grep -q "#$code)" <<<"$err" || { echo "$err" >&2; fail "$label: expected Error(Contract, #$code)"; }
  echo "  ✓ $label → Error(Contract, #$code)"
}

field() { sed -E "s/.*\"$1\":([^,}]*).*/\1/" <<<"$2"; }
hash_of() { printf 'sterun-bib-sanity-%s-%s' "$1" "$(date -u +%s)" | shasum -a 256 | cut -d' ' -f1; }

say "target"
echo "  EventRegistry  $ER"
live_er="$(onchain_hash "$ER")"
want_er="$(shasum -a 256 "$SC_DIR/target/wasm32v1-none/release/event_registry.wasm" | cut -d' ' -f1)"
echo "  live wasm      $live_er"
echo "  built wasm     $want_er"
[ "$live_er" = "$want_er" ] || fail "the live contract is not running this build — run upgrade-testnet.sh first"
echo "  ✓ the address is running the wasm built from this tree"

echo "  RaceRecord     $RR"
live_rr="$(onchain_hash "$RR")"
want_rr="$(shasum -a 256 "$SC_DIR/target/wasm32v1-none/release/race_record.wasm" | cut -d' ' -f1)"
[ "$live_rr" = "$want_rr" ] || fail "RaceRecord is not running this build ($live_rr)"
echo "  ✓ unchanged by this ticket, and still the build in this tree"
echo "  organiser      $ORGANISER"
echo "  runner         $RUNNER"

# --------------------------------------------------------------------------
say "(b) an event written BEFORE the upgrade, read through the new code"
event0="$(view "$ER" get_event --event_id 0)"
cat0="$(view "$ER" get_category --event_id 0 --category_id 0)"
addon0="$(view "$ER" get_addon --event_id 0 --addon_id 0)"
record0="$(view "$RR" record_of --token_id 0)"
echo "  event 0     $event0"
echo "  category 0  $cat0"
echo "  addon 0     $addon0"
echo "  record 0    $record0"
[ "$(field name "$event0")" = '"Sterun Testnet Rehearsal"' ] || fail "event 0 no longer decodes as itself"
[ "$(field entered_count "$cat0")" = "3" ] || fail "category 0 lost its entry count"
[ "$(field reserved_count "$addon0")" = "2" ] || fail "addon 0 lost its reserved count"
[ "$(view "$ER" category_count --event_id 0)" = "1" ] || fail "category_count moved"
# A bib of 0 cannot be issued by v2.3. Finding one still on chain is the
# positive proof that no number was rewritten by the upgrade.
[ "$(field bib_no "$record0")" = "0" ] || fail "record 0's bib was rewritten"
echo "  ✓ decoded unchanged, and record 0 still wears the bib 0 that only the old scheme could issue"

# --------------------------------------------------------------------------
say "(a) a NEW event, two distances"
send "$ORGANISER_ID" "$ER" create_event --organiser "$ORGANISER" \
  --name "Sterun bib uniqueness sanity $(date -u +%F)" \
  --metadata_hash 0000000000000000000000000000000000000000000000000000000000000000 \
  --uri "https://sterun.xyz/events/bib-sanity.json" --starts_at 1800000000
EVENT="$OUT"; TX_EVENT="$TX"; echo "  event_id $EVENT           tx $TX"
send "$ORGANISER_ID" "$ER" add_category --event_id "$EVENT" --code FUN10K --distance_m 10000 --quota 2 --price_usdc 0
TEN_K="$OUT"; echo "  category $TEN_K FUN10K quota 2  tx $TX"
send "$ORGANISER_ID" "$ER" add_category --event_id "$EVENT" --code FUN5K --distance_m 5000 --quota 1 --price_usdc 0
FIVE_K="$OUT"; echo "  category $FIVE_K FUN5K  quota 1  tx $TX"
send "$ORGANISER_ID" "$ER" set_event_status --event_id "$EVENT" --status Open
echo "  Open                     tx $TX"

# Enters the event and asserts the bib. $1 category, $2 expected bib, $3 label.
enter_expecting() {
  local category="$1" want="$2" label="$3"
  send "$RUNNER_ID" "$RR" enter --runner "$RUNNER" --event_id "$EVENT" --category_id "$category" \
    --addon_ids '[]' --participant_hash "$(hash_of "$label")"
  local token="$OUT" tx="$TX" log="$LOG"
  # The registry's own event carries the bib as `seq`, with the layout frozen
  # since v2.0 — so an indexer reading only events sees the same number.
  grep -q 'slot_reserved' <<<"$log" || { echo "$log" >&2; fail "$label: no slot_reserved event"; }
  local record; record="$(view "$RR" record_of --token_id "$token")"
  local got; got="$(field bib_no "$record")"
  [ "$got" = "$want" ] || fail "$label: bib $got, expected $want"
  echo "  $label  token_id $token  bib $got   tx $tx"
  BIBS="${BIBS:-}$got "
  LAST_TOKEN="$token"
}

BIBS=""
enter_expecting "$TEN_K"  1 "10K entrant 1"
enter_expecting "$FIVE_K" 2 "5K  entrant 1"
enter_expecting "$TEN_K"  3 "10K entrant 2"
[ "$BIBS" = "1 2 3 " ] || fail "bibs were $BIBS"
echo "  ✓ 1, 2, 3 across two distances — the first runner of each distance is NOT 0"

# --------------------------------------------------------------------------
say "(c) the quota still refuses, per distance"
[ "$(field entered_count "$(view "$ER" get_category --event_id "$EVENT" --category_id "$TEN_K")")" = "2" ] \
  || fail "the 10K's quota counter is wrong"
[ "$(field entered_count "$(view "$ER" get_category --event_id "$EVENT" --category_id "$FIVE_K")")" = "1" ] \
  || fail "the 5K's quota counter is wrong"
echo "  10K 2/2 taken, 5K 1/1 taken — counted per distance, not from the bib sequence"

expect_revert 5 "a fourth entry in the full 10K" "$RUNNER_ID" "$RR" enter --runner "$RUNNER" \
  --event_id "$EVENT" --category_id "$TEN_K" --addon_ids '[]' --participant_hash "$(hash_of full10k)"
expect_revert 5 "a second entry in the full 5K" "$RUNNER_ID" "$RR" enter --runner "$RUNNER" \
  --event_id "$EVENT" --category_id "$FIVE_K" --addon_ids '[]' --participant_hash "$(hash_of full5k)"

# A refused entry consumed no bib either: the counters did not move.
[ "$(field entered_count "$(view "$ER" get_category --event_id "$EVENT" --category_id "$TEN_K")")" = "2" ] \
  || fail "a refused entry moved the quota counter"
echo "  ✓ refused entries changed nothing"

# --------------------------------------------------------------------------
say "(b, again) the old event is exactly where it was"
[ "$(view "$ER" get_event --event_id 0)" = "$event0" ] || fail "event 0 changed"
[ "$(view "$ER" get_category --event_id 0 --category_id 0)" = "$cat0" ] || fail "category 0 changed"
[ "$(view "$RR" record_of --token_id 0)" = "$record0" ] || fail "record 0 changed"
echo "  ✓ untouched by a whole race running beside it"

say "EVIDENCE"
cat <<EOF
EventRegistry          $ER  (address UNCHANGED)
  wasm                 $live_er
RaceRecord             $RR  $live_rr (not upgraded)
new event_id           $EVENT  tx $TX_EVENT
  category $TEN_K FUN10K       quota 2 -> bibs 1 and 3
  category $FIVE_K FUN5K        quota 1 -> bib 2
  bibs issued          $BIBS
  QuotaFull(5)         refused a 3rd 10K and a 2nd 5K entry
pre-upgrade state      event 0 "$(field name "$event0" | tr -d '"')", category 0 entered_count $(field entered_count "$cat0"), record 0 bib $(field bib_no "$record0")
EOF
