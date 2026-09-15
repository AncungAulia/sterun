#!/usr/bin/env bash
#
# STE-55 — prove the quota rules on the LIVE EventRegistry, after
# `upgrade-testnet.sh` has installed the v2.4 wasm at the SAME address.
#
#   bash sc/scripts/quota-testnet.sh
#   ER=C… RR=C… bash sc/scripts/quota-testnet.sh
#
# Four things, every one of them asserted rather than printed:
#
#   (a) the fix:    a distance sells out, `QuotaFull(5)` refuses an entrant,
#                   the organiser raises the quota, and THAT SAME entrant gets
#                   in — with a bib that continues the event's sequence rather
#                   than restarting it. `quota_increased` carries `previous`
#                   and `current`.
#   (b) the rule:   `increase_quota` to the same number and to a smaller one
#                   are both refused with `QuotaNotIncreased(19)`, and the
#                   refusals change nothing. A shrink below the entries already
#                   taken is refused by the same rule.
#   (c) the gate:   the new cap is a real cap — one past it is `QuotaFull(5)`
#                   again — and `entered_count` was never touched by the raise.
#   (d) the state:  an event and a category written BEFORE the upgrade still
#                   decode identically, and record 0 still wears bib `0`, which
#                   no code since v2.3 can issue.
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
quota_of()   { field quota "$(view "$ER" get_category --event_id "$EVENT" --category_id "$1")"; }
entered_of() { field entered_count "$(view "$ER" get_category --event_id "$EVENT" --category_id "$1")"; }
hash_of() { printf 'sterun-quota-sanity-%s-%s' "$1" "$(date -u +%s)" | shasum -a 256 | cut -d' ' -f1; }

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
say "(d) an event written BEFORE the upgrade, read through the new code"
event0="$(view "$ER" get_event --event_id 0)"
cat0="$(view "$ER" get_category --event_id 0 --category_id 0)"
record0="$(view "$RR" record_of --token_id 0)"
echo "  event 0     $event0"
echo "  category 0  $cat0"
echo "  record 0    $record0"
[ "$(field name "$event0")" = '"Sterun Testnet Rehearsal"' ] || fail "event 0 no longer decodes as itself"
[ "$(field entered_count "$cat0")" = "3" ] || fail "category 0 lost its entry count"
[ "$(field quota "$cat0")" = "5" ] || fail "category 0's quota moved — nothing here should have raised it"
[ "$(field bib_no "$record0")" = "0" ] || fail "record 0's bib was rewritten"
echo "  ✓ decoded unchanged — including a quota this ticket did not touch"

# --------------------------------------------------------------------------
say "(a) a NEW event whose 10K sells out, then opens a second batch"
send "$ORGANISER_ID" "$ER" create_event --organiser "$ORGANISER" \
  --name "Sterun quota increase sanity $(date -u +%F)" \
  --metadata_hash 0000000000000000000000000000000000000000000000000000000000000000 \
  --uri "https://sterun.xyz/events/quota-sanity.json" --starts_at 1800000000
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
  local token="$OUT" tx="$TX"
  local record; record="$(view "$RR" record_of --token_id "$token")"
  local got; got="$(field bib_no "$record")"
  [ "$got" = "$want" ] || fail "$label: bib $got, expected $want"
  echo "  $label  token_id $token  bib $got   tx $tx"
  BIBS="${BIBS:-}$got "
}

BIBS=""
enter_expecting "$TEN_K"  1 "10K entrant 1"
enter_expecting "$TEN_K"  2 "10K entrant 2"
enter_expecting "$FIVE_K" 3 "5K  entrant 1"

# Sold out — this is the position the ticket exists for.
expect_revert 5 "a third entry in the full 10K" "$RUNNER_ID" "$RR" enter --runner "$RUNNER" \
  --event_id "$EVENT" --category_id "$TEN_K" --addon_ids '[]' --participant_hash "$(hash_of soldout)"

send "$ORGANISER_ID" "$ER" increase_quota --event_id "$EVENT" --category_id "$TEN_K" --new_quota 4
TX_RAISE="$TX"
echo "  increase_quota 2 -> 4    tx $TX"
# The CLI renders the emitted event as `Event: QuotaIncreased (quota_increased),
# event_id: 18, category_id: 0, previous: 2, current: 4` — plain text, not JSON.
grep -q 'quota_increased' <<<"$LOG" || { echo "$LOG" >&2; fail "no quota_increased event"; }
grep -qE 'previous: *2(,|$)' <<<"$LOG" || { echo "$LOG" >&2; fail "quota_increased did not carry previous 2"; }
grep -qE 'current: *4(,|$)'  <<<"$LOG" || { echo "$LOG" >&2; fail "quota_increased did not carry current 4"; }
echo "  ✓ quota_increased carried previous 2 and current 4"
[ "$(quota_of "$TEN_K")" = "4" ] || fail "the 10K's quota did not move to 4"

# The runner who was just refused gets in, and their bib continues the event's
# sequence — 4, not a restart at 1.
enter_expecting "$TEN_K" 4 "10K entrant 3 (second batch)"
enter_expecting "$TEN_K" 5 "10K entrant 4 (second batch)"
[ "$BIBS" = "1 2 3 4 5 " ] || fail "bibs were $BIBS"
echo "  ✓ a sold-out distance sells again, and the second batch continues the race's numbering"

# --------------------------------------------------------------------------
say "(b) the number only ever goes up"
expect_revert 19 "increase_quota to the same number (4)" "$ORGANISER_ID" "$ER" \
  increase_quota --event_id "$EVENT" --category_id "$TEN_K" --new_quota 4
expect_revert 19 "increase_quota to a smaller number (3)" "$ORGANISER_ID" "$ER" \
  increase_quota --event_id "$EVENT" --category_id "$TEN_K" --new_quota 3
# 4 entries are already taken here, so this is the shrink that would strand
# paid entrants: it is refused by the same rule, not by a special case.
expect_revert 19 "increase_quota below the entries already taken (1)" "$ORGANISER_ID" "$ER" \
  increase_quota --event_id "$EVENT" --category_id "$TEN_K" --new_quota 1
expect_revert 19 "increase_quota to 0" "$ORGANISER_ID" "$ER" \
  increase_quota --event_id "$EVENT" --category_id "$TEN_K" --new_quota 0
[ "$(quota_of "$TEN_K")" = "4" ] || fail "a refused increase moved the quota"
[ "$(entered_of "$TEN_K")" = "4" ] || fail "a refused increase moved entered_count"
echo "  ✓ the refusals changed neither the quota nor the entry count"

expect_revert 3 "increase_quota on an unknown category" "$ORGANISER_ID" "$ER" \
  increase_quota --event_id "$EVENT" --category_id 99 --new_quota 500
expect_revert 2 "increase_quota on an unknown event" "$ORGANISER_ID" "$ER" \
  increase_quota --event_id 99999 --category_id 0 --new_quota 500

# --------------------------------------------------------------------------
say "(c) the new cap is a real cap, and the raise touched nothing else"
expect_revert 5 "a fifth entry in the raised 10K" "$RUNNER_ID" "$RR" enter --runner "$RUNNER" \
  --event_id "$EVENT" --category_id "$TEN_K" --addon_ids '[]' --participant_hash "$(hash_of full10k)"
# The 5K was never raised and is still refusing on its original quota of 1.
expect_revert 5 "a second entry in the untouched 5K" "$RUNNER_ID" "$RR" enter --runner "$RUNNER" \
  --event_id "$EVENT" --category_id "$FIVE_K" --addon_ids '[]' --participant_hash "$(hash_of full5k)"
[ "$(quota_of "$FIVE_K")" = "1" ] || fail "raising the 10K moved the 5K's quota"
[ "$(entered_of "$FIVE_K")" = "1" ] || fail "raising the 10K moved the 5K's entry count"
echo "  ✓ 10K 4/4 and 5K 1/1 — one distance's second batch is that distance's business"

# --------------------------------------------------------------------------
say "(d, again) the old event is exactly where it was"
[ "$(view "$ER" get_event --event_id 0)" = "$event0" ] || fail "event 0 changed"
[ "$(view "$ER" get_category --event_id 0 --category_id 0)" = "$cat0" ] || fail "category 0 changed"
[ "$(view "$RR" record_of --token_id 0)" = "$record0" ] || fail "record 0 changed"
echo "  ✓ untouched by a whole race selling out beside it"

say "EVIDENCE"
cat <<EOF
EventRegistry          $ER  (address UNCHANGED)
  wasm                 $live_er
RaceRecord             $RR  $live_rr (not upgraded)
new event_id           $EVENT  tx $TX_EVENT
  category $TEN_K FUN10K       quota 2 -> 4 (increase_quota, tx $TX_RAISE) -> bibs 1, 2, 4, 5
  category $FIVE_K FUN5K        quota 1, untouched -> bib 3
  bibs issued          $BIBS
  QuotaFull(5)         refused a 3rd 10K entry BEFORE the raise and a 5th AFTER it
  QuotaNotIncreased(19) refused 4, 3, 1 and 0 against a quota of 4
pre-upgrade state      event 0 "$(field name "$event0" | tr -d '"')", category 0 quota $(field quota "$cat0") entered_count $(field entered_count "$cat0"), record 0 bib $(field bib_no "$record0")
EOF
