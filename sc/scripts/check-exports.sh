#!/usr/bin/env bash
#
# STE-9 (C2) — the product claim, checked against the artifact that ships.
#
# A Soroban contract exposes exactly the functions in its export surface: no
# fallback dispatch, no delegatecall. So "race records are non-transferable" is
# only true if `race_record.wasm` exports NO function that could move, destroy
# or delegate a record — and it must not carry EventRegistry's surface either,
# because it talks to C1 as a client rather than embedding it.
#
# Usage (from anywhere):  sc/scripts/check-exports.sh
# Exits non-zero on any violation. The same assertion runs from `cargo test` as
# `test::exports::race_record_wasm_exports_nothing_that_could_move_a_record`,
# which walks the wasm export section directly.

set -euo pipefail

SC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WASM="${SC_DIR}/target/wasm32v1-none/release/race_record.wasm"

# Anything that could move, destroy or delegate a record.
BANNED_FNS=(transfer transfer_from approve approve_for_all burn burn_from)
# EventRegistry's own surface (C1, STE-5).
REGISTRY_FNS=(
  create_event add_category set_event_status add_scanner remove_scanner
  reserve_slot set_race_record get_race_record get_event get_organiser
  is_scanner event_count
)

cd "${SC_DIR}"
echo "==> stellar contract build"
stellar contract build >/dev/null

if [[ ! -f "${WASM}" ]]; then
  echo "FAIL: ${WASM} not found" >&2
  exit 1
fi

echo "==> stellar contract info interface --wasm ${WASM#"${SC_DIR}/"}"
INTERFACE="$(stellar contract info interface --wasm "${WASM}")"

status=0
check_absent() {
  local name="$1" reason="$2"
  # `fn <name>(` — exact function name, so `token_uri` never trips on `uri`.
  if grep -qE "^[[:space:]]*fn ${name}\(" <<<"${INTERFACE}"; then
    echo "FAIL: race_record.wasm exports \`${name}\` — ${reason}" >&2
    status=1
  fi
}

for fn in "${BANNED_FNS[@]}"; do
  check_absent "${fn}" "records would be transferable"
done
for fn in "${REGISTRY_FNS[@]}"; do
  check_absent "${fn}" "EventRegistry's surface leaked into RaceRecord"
done

# Sanity: the parse has to be finding functions at all.
if ! grep -qE "^[[:space:]]*fn enter\(" <<<"${INTERFACE}"; then
  echo "FAIL: \`enter\` not found in the interface — the check is not reading anything" >&2
  status=1
fi

size="$(wc -c <"${WASM}" | tr -d ' ')"
if (( size > 131072 )); then
  echo "FAIL: race_record.wasm is ${size} bytes, over the 128KB contract limit" >&2
  status=1
fi

if (( status == 0 )); then
  echo "OK: no transfer/approve/burn, no EventRegistry functions, ${size} bytes (limit 131072)"
fi
exit "${status}"
