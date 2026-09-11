# `testdata/` — the wasm the upgrade replaces

One file, and it is not a build artifact of this repo:

| File | sha256 | What it is |
| --- | --- | --- |
| `event_registry_live_pre_allowlist.wasm` | `22bb432ecfd5480a7dbfe68949df2aa6ccd9c87c21db2b7ec9dd19bf6d032a2f` | EventRegistry v2.0.1, the executable running at `CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU` before STE-36 |

Fetched from testnet as-is:

```bash
stellar contract fetch \
  --id CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU \
  --network testnet \
  --out-file sc/contracts/event_registry/testdata/event_registry_live_pre_allowlist.wasm
```

## Why it is committed rather than fetched when the test runs

The old `mod upgrade` deployed the contract from freshly built wasm and then upgraded to the **same**
wasm. That proves storage is not lost when the executable is replaced, but it does not prove the
thing STE-36 actually put at risk: that state written by the **old** code is still readable by the
**new** code. That needs two genuinely different wasm files, and the "old" one has to be the artefact
that really wrote the events now living on the chain — not a copy of today's build.

The test touches no network (CI's `contracts.yml` has no testnet access, and a test that needs the
internet is a test that goes red one day because an RPC is down), so the bytes live in the repo.
`state_written_by_the_live_wasm_survives_the_allowlist_upgrade` verifies for itself that this file is
genuine: the host hashes it on upload and the result is compared against the hash in the table above
— the same hash the ledger reports for `CAPB6NQP…` and the one frozen in `docs/specs/INTERFACE.md`
§0.

## When to replace this file

Only after the next in-place upgrade has genuinely landed on testnet: fetch it again, and update the
hash in this table **and** `LIVE_PRE_ALLOWLIST_HASH` in `src/test.rs`. Do not replace it with the
output of a local `stellar contract build` — the moment this file becomes a copy of the current
build, the test stops proving anything.
