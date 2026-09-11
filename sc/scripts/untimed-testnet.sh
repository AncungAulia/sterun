#!/usr/bin/env bash
#
# STE-41 — prove `record_finish_untimed` on the LIVE RaceRecord, after
# `upgrade-testnet.sh` has installed the v2.2 wasm at the SAME address.
#
#   bash sc/scripts/untimed-testnet.sh
#   RR=C… ER=C… bash sc/scripts/untimed-testnet.sh
#
# Three things, every one of them asserted rather than printed:
#
#   (a) the new path:  enter -> claim_racepack -> record_finish_untimed, and
#       record_of reads Finished with finish_time_s null. The tx must carry a
#       `record_finished_untimed` event and NO `record_finished`.
#   (b) the old path:  record_finish with a real time still lands, and still
#       refuses 0 with InvalidFinishTime(105).
#   (c) the storage:   records written by the old code still read back.
#
# Plus the guards, because a deploy that only shows the happy path has not shown
# the guards survived to a real network: untimed before a claim is #103, every
# result path after an untimed finish is #103, and a non-organiser is refused.
#
# The event is a fresh FREE one owned by `sterun-organiser` (allowlisted in
# STE-36), so no sUSD moves and the rehearsal event's last slot is not spent.
set -euo pipefail

NETWORK="${NETWORK:-testnet}"
ORGANISER_ID="${ORGANISER_ID:-sterun-organiser}"
RUNNER_ID="${RUNNER_ID:-sterun-runner-a}"

ER="${ER:-CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU}"
RR="${RR:-CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW}"

ORGANISER="$(stellar keys address "$ORGANISER_ID")"
RUNNER="$(stellar keys address "$RUNNER_ID")"

say()  { printf '\n=== %s ===\n' "$*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }
view() { stellar contract invoke --id "$1" --source-account "$RUNNER_ID" --network "$NETWORK" --send=no -- "${@:2}" 2>/dev/null | tail -1; }

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

say "target"
echo "  RaceRecord     $RR"
echo "  wasm           $(stellar contract info hash --contract-id "$RR" --network "$NETWORK" 2>/dev/null | tail -1)"
echo "  organiser      $ORGANISER"
echo "  runner         $RUNNER"
stellar contract info interface --contract-id "$RR" --network "$NETWORK" 2>/dev/null \
  | grep -qE '^[[:space:]]*fn record_finish_untimed\(' \
  || fail "the live contract does not export record_finish_untimed — run upgrade-testnet.sh first"
echo "  ✓ the live contract exports record_finish_untimed"

# --------------------------------------------------------------------------
say "(c) before touching anything: what the OLD code wrote"
supply_before="$(view "$RR" total_supply)"
record0="$(view "$RR" record_of --token_id 0)"
echo "  total_supply  $supply_before"
echo "  record 0      $record0"
echo "  owner_of 0    $(view "$RR" owner_of --token_id 0)"
[ "$(field state "$record0")" = '"Finished"' ] || fail "record 0 is no longer Finished"
[ "$(field finish_time_s "$record0")" = "3161" ] || fail "record 0 lost its finish time"

# --------------------------------------------------------------------------
say "a free event for the rehearsal"
send "$ORGANISER_ID" "$ER" create_event --organiser "$ORGANISER" \
  --name "Sterun untimed finish sanity $(date -u +%F)" \
  --metadata_hash 0000000000000000000000000000000000000000000000000000000000000000 \
  --uri "https://sterun.xyz/events/untimed-sanity.json" --starts_at 1800000000
EVENT="$OUT"; echo "  event_id $EVENT        tx $TX"
send "$ORGANISER_ID" "$ER" add_category --event_id "$EVENT" --code FUN5K --distance_m 5000 --quota 5 --price_usdc 0
CATEGORY="$OUT"; echo "  category $CATEGORY FUN5K free  tx $TX"
send "$ORGANISER_ID" "$ER" set_event_status --event_id "$EVENT" --status Open
echo "  Open                  tx $TX"

hash_of() { printf 'sterun-untimed-sanity-%s-%s' "$1" "$(date -u +%s)" | shasum -a 256 | cut -d' ' -f1; }

# --------------------------------------------------------------------------
say "(a) enter -> claim_racepack -> record_finish_untimed"
send "$RUNNER_ID" "$RR" enter --runner "$RUNNER" --event_id "$EVENT" --category_id "$CATEGORY" \
  --addon_ids '[]' --participant_hash "$(hash_of untimed)"
UNTIMED="$OUT"; TX_ENTER_U="$TX"; echo "  enter                 token_id $UNTIMED  tx $TX"

expect_revert 103 "record_finish_untimed before the race pack is claimed" \
  "$ORGANISER_ID" "$RR" record_finish_untimed --token_id "$UNTIMED"

send "$ORGANISER_ID" "$RR" claim_racepack --token_id "$UNTIMED" --operator "$ORGANISER"
TX_CLAIM_U="$TX"; echo "  claim_racepack        tx $TX"

# The runner signing for their own finish. The contract demands the ORGANISER's
# auth (read from the registry), so this is an auth refusal from the host — not
# a contract error code — and the only honest assertion is "it did not land and
# the record did not move".
if stellar contract invoke --id "$RR" --source-account "$RUNNER_ID" --network "$NETWORK" \
     -- record_finish_untimed --token_id "$UNTIMED" >/dev/null 2>&1; then
  fail "the runner declared their own untimed finish"
fi
[ "$(field state "$(view "$RR" record_of --token_id "$UNTIMED")")" = '"RacepackClaimed"' ] \
  || fail "a non-organiser moved the record"
echo "  ✓ record_finish_untimed signed by the runner → refused, still RacepackClaimed"

send "$ORGANISER_ID" "$RR" record_finish_untimed --token_id "$UNTIMED"
TX_UNTIMED="$TX"; UNTIMED_LOG="$LOG"; echo "  record_finish_untimed tx $TX"
grep -q 'record_finished_untimed' <<<"$UNTIMED_LOG" || { echo "$UNTIMED_LOG" >&2; fail "no record_finished_untimed event in the tx"; }
grep -qE 'record_finished[^_]|record_finished$' <<<"$UNTIMED_LOG" && fail "the untimed tx also emitted record_finished"
echo "  ✓ emitted record_finished_untimed, and no record_finished"

untimed_record="$(view "$RR" record_of --token_id "$UNTIMED")"
echo "  record_of $UNTIMED  $untimed_record"
[ "$(field state "$untimed_record")" = '"Finished"' ] || fail "state is not Finished"
[ "$(field finish_time_s "$untimed_record")" = "null" ] || fail "finish_time_s is not empty"
[ "$(field result_at "$untimed_record")" != "null" ] || fail "result_at was not written"
echo "  ✓ Finished, finish_time_s null, result_at set"

say "terminal: every result path is closed after an untimed finish"
expect_revert 103 "record_finish after an untimed finish" "$ORGANISER_ID" "$RR" record_finish --token_id "$UNTIMED" --finish_time_s 3000
expect_revert 103 "record_dnf after an untimed finish" "$ORGANISER_ID" "$RR" record_dnf --token_id "$UNTIMED"
expect_revert 103 "record_finish_untimed twice" "$ORGANISER_ID" "$RR" record_finish_untimed --token_id "$UNTIMED"
[ "$(view "$RR" record_of --token_id "$UNTIMED")" = "$untimed_record" ] || fail "a refused call changed the record"
echo "  ✓ the record did not move"

# --------------------------------------------------------------------------
say "(b) the timed path is unchanged"
send "$RUNNER_ID" "$RR" enter --runner "$RUNNER" --event_id "$EVENT" --category_id "$CATEGORY" \
  --addon_ids '[]' --participant_hash "$(hash_of timed)"
TIMED="$OUT"; TX_ENTER_T="$TX"; echo "  enter                 token_id $TIMED  tx $TX"
send "$ORGANISER_ID" "$RR" claim_racepack --token_id "$TIMED" --operator "$ORGANISER"
TX_CLAIM_T="$TX"; echo "  claim_racepack        tx $TX"
expect_revert 105 "record_finish with 0 is still refused" "$ORGANISER_ID" "$RR" record_finish --token_id "$TIMED" --finish_time_s 0
send "$ORGANISER_ID" "$RR" record_finish --token_id "$TIMED" --finish_time_s 1847
TX_TIMED="$TX"; echo "  record_finish 1847    tx $TX"
grep -q 'record_finished' <<<"$LOG" || fail "no record_finished event in the timed tx"
grep -q 'record_finished_untimed' <<<"$LOG" && fail "the timed tx emitted record_finished_untimed"
timed_record="$(view "$RR" record_of --token_id "$TIMED")"
echo "  record_of $TIMED  $timed_record"
[ "$(field state "$timed_record")" = '"Finished"' ] || fail "timed state is not Finished"
[ "$(field finish_time_s "$timed_record")" = "1847" ] || fail "timed finish_time_s is not 1847"
echo "  ✓ Finished in 1847 s, via record_finished"

# --------------------------------------------------------------------------
say "(c) after: the OLD records still read back, and supply continued"
[ "$(view "$RR" record_of --token_id 0)" = "$record0" ] || fail "record 0 changed"
supply_after="$(view "$RR" total_supply)"
[ "$supply_after" = "$((supply_before + 2))" ] || fail "total_supply $supply_before -> $supply_after"
echo "  ✓ record 0 unchanged, total_supply $supply_before -> $supply_after"

moved=$(stellar contract info interface --contract-id "$RR" --network "$NETWORK" 2>/dev/null \
  | grep -cE '^[[:space:]]*fn (transfer|transfer_from|approve|approve_for_all|burn|burn_from)\(' || true)
[ "$moved" -eq 0 ] || fail "the live contract exports $moved transfer-ish function(s)"
echo "  ✓ 0 transfer-ish exports"

say "EVIDENCE"
cat <<EOF
event_id               $EVENT (category $CATEGORY FUN5K, free)
untimed  token_id      $UNTIMED
  enter                $TX_ENTER_U
  claim_racepack       $TX_CLAIM_U
  record_finish_untimed $TX_UNTIMED
  record_of            $untimed_record
timed    token_id      $TIMED
  enter                $TX_ENTER_T
  claim_racepack       $TX_CLAIM_T
  record_finish 1847   $TX_TIMED
  record_of            $timed_record
record 0 (old code)    $record0
total_supply           $supply_before -> $supply_after
EOF
