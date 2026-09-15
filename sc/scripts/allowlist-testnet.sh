#!/usr/bin/env bash
#
# STE-36 — seed the organiser allowlist on the LIVE registry, then prove the
# gate from both sides.
#
#   bash sc/scripts/allowlist-testnet.sh                 # seed + sanity
#   ER=C… EXTRA="G… G…" bash sc/scripts/allowlist-testnet.sh
#
# Run this straight after `upgrade-testnet.sh` has put the v2.1 wasm on the
# address. It exists because of one property of the upgrade: `upgrade` replaces
# code, not storage, and nothing migrates existing organisers into the new
# allowlist. So the moment the upgrade lands, the allowlist is EMPTY and
# `create_event` refuses everybody — including organisers who already have live
# events. Seeding is a deploy step, not a nicety.
#
# The sanity checks below ASSERT rather than print, and two of the three are
# negative. A deploy that only shows the happy path has not shown that the
# guard survived to the real network, and the guard is the product here.
set -euo pipefail

SC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$SC_DIR/.." && pwd)"
NETWORK="${NETWORK:-testnet}"
ADMIN_ID="${ADMIN_ID:-sterun-admin}"
READER_ID="${READER_ID:-sterun-runner-a}"
# An address that must NOT be on the allowlist, to prove the gate closes.
OUTSIDER_ID="${OUTSIDER_ID:-sterun-test-a}"

ER="${ER:-CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU}"

# Who gets access. The pilot organiser identity, plus anything in EXTRA — used
# for wallets that already own live events and whose demo must keep working.
ORGANISER_ADDRESS="${ORGANISER_ADDRESS:-$(stellar keys address sterun-organiser)}"
EXTRA="${EXTRA:-}"

say() { printf '\n=== %s ===\n' "$*"; }
read_only() { stellar contract invoke --id "$ER" --source-account "$READER_ID" --network "$NETWORK" --send=no -- "$@" 2>/dev/null | tail -1; }
as_admin()  { stellar contract invoke --id "$ER" --source-account "$ADMIN_ID"  --network "$NETWORK" -- "$@"; }

say "target"
echo "  contract $ER"
echo "  wasm     $(stellar contract info hash --contract-id "$ER" --network "$NETWORK" 2>/dev/null | tail -1)"
echo "  admin    $(stellar keys address "$ADMIN_ID")"

# --------------------------------------------------------------------------
# Seed. Idempotent: re-running must not fail on OrganiserAlreadyAdded(16),
# because an operator who is not sure whether the seed ran should be able to
# just run it again.
# --------------------------------------------------------------------------
say "seeding the allowlist"
for who in $ORGANISER_ADDRESS $EXTRA; do
  if [ "$(read_only is_organiser --addr "$who")" = "true" ]; then
    echo "  $who already allowlisted — skipped"
    continue
  fi
  as_admin add_organiser --organiser "$who" >/dev/null
  [ "$(read_only is_organiser --addr "$who")" = "true" ] || { echo "FAIL: $who is still not allowlisted" >&2; exit 1; }
  echo "  $who added"
done

# --------------------------------------------------------------------------
# The gate, from both sides.
# --------------------------------------------------------------------------
outsider="$(stellar keys address "$OUTSIDER_ID")"

say "negative: an address the admin never allowlisted cannot create an event"
[ "$(read_only is_organiser --addr "$outsider")" = "false" ] || { echo "FAIL: $outsider IS allowlisted; pick another OUTSIDER_ID" >&2; exit 1; }
if err=$(stellar contract invoke --id "$ER" --source-account "$OUTSIDER_ID" --network "$NETWORK" \
      -- create_event --organiser "$outsider" --name "Jakarta Marathon 2026" \
      --metadata_hash 0000000000000000000000000000000000000000000000000000000000000000 \
      --uri "https://sterun.xyz/events/impersonation.json" --starts_at 1800000000 2>&1); then
  echo "FAIL: a non-allowlisted address created an event" >&2; exit 1
fi
grep -q '#18' <<<"$err" || { echo "FAIL: expected Error(Contract, #18), got:" >&2; echo "$err" >&2; exit 1; }
echo "  ✓ $outsider → Error(Contract, #18) NotAllowlistedOrganiser"

say "positive: the seeded organiser can"
before="$(read_only event_count)"
# Signed by the organiser, not the admin: the allowlist grants the right to
# create, it does not create on anyone's behalf.
created=$(stellar contract invoke --id "$ER" --source-account sterun-organiser --network "$NETWORK" \
  -- create_event --organiser "$ORGANISER_ADDRESS" --name "Sterun allowlist sanity $(date -u +%F)" \
  --metadata_hash 0000000000000000000000000000000000000000000000000000000000000000 \
  --uri "https://sterun.xyz/events/allowlist-sanity.json" --starts_at 1800000000 2>/dev/null | tail -1)
after="$(read_only event_count)"
[ "$after" = "$((before + 1))" ] || { echo "FAIL: event_count $before -> $after" >&2; exit 1; }
echo "  ✓ event_id $created created by $ORGANISER_ADDRESS (event_count $before -> $after)"

# --------------------------------------------------------------------------
# And the reason the upgrade was in place rather than a redeploy.
# --------------------------------------------------------------------------
say "state written before the upgrade, read after it"
for i in $(seq 0 $((before - 1))); do
  event="$(read_only get_event --event_id "$i")"
  grep -q '"organiser"' <<<"$event" || { echo "FAIL: event $i does not read back: $event" >&2; exit 1; }
  echo "  event $i  $(sed -E 's/.*"name":"([^"]*)".*/\1/' <<<"$event")"
done
echo "  category 0/0 $(read_only get_category --event_id 0 --category_id 0)"
echo "  addon 0/0    $(read_only get_addon --event_id 0 --addon_id 0)"

say "DONE"
echo "EVENT_REGISTRY=$ER (unchanged)"
echo "Record the upgrade tx, the seeded wallets and this evidence in docs/deployments.md."
