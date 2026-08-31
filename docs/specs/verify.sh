#!/usr/bin/env bash
# Runs BOTH reference implementations of the Sterun C4 spec (STE-10) against the
# vectors in `docs/specs/vectors/` and fails loudly if either disagrees.
#
#   bash docs/specs/verify.sh
#
# The point is not that one implementation passes its own tests. It is that two
# implementations written independently — Node with `node:crypto`, Rust with
# RustCrypto + unicode-normalization — produce byte-identical output for every
# vector. That is what makes the spec reproducible for James (backend) and
# Ancung (pass + scanner) without reading either of these files.
#
# Requirements: node >= 18 (no npm dependencies at all) and a stable Rust
# toolchain. Neither touches the contract workspace in `sc/`.
set -uo pipefail

SPEC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=============================================================="
echo " Sterun spec vectors — two independent implementations"
echo " vectors: $SPEC_DIR/vectors"
echo "=============================================================="
echo

failed=0

echo "--- 1/2  Node reference ($(node --version)) -------------------"
if node "$SPEC_DIR/reference/node/verify-vectors.mjs"; then
  node_status="PASS"
else
  node_status="FAIL"
  failed=1
fi
echo

echo "--- 2/2  Rust reference ($(rustc --version)) ------------------"
if (cd "$SPEC_DIR/reference/rust" && cargo test --quiet); then
  rust_status="PASS"
else
  rust_status="FAIL"
  failed=1
fi
echo

echo "=============================================================="
printf ' node reference : %s\n' "$node_status"
printf ' rust reference : %s\n' "$rust_status"
echo "=============================================================="

if [ "$failed" -ne 0 ]; then
  echo
  echo "VERIFY FAILED — the two implementations do not agree on the frozen spec."
  echo "Do NOT regenerate the vectors to make this pass: the vectors are the"
  echo "frozen artifact (docs/specs/CHANGELOG.md). Fix the implementation, or"
  echo "open a spec-change PR per the rules in docs/specs/HASH_AND_TOTP.md."
  exit 1
fi

echo
echo "VERIFY OK — both implementations agree on every vector."
