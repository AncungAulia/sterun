# `testdata/` — the wasm the upgrade replaces

One file, and it is not a build artifact of this repo:

| File | sha256 | What it is |
| --- | --- | --- |
| `race_record_live_pre_untimed.wasm` | `27749180046a9a4e62e85ec46cb6b61cd35a0914db4f4eb61d66616febd4302b` | RaceRecord v2.0.1, the executable running at `CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW` before STE-41 |

Fetched from testnet as-is, before the upgrade:

```bash
stellar contract fetch \
  --id CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW \
  --network testnet \
  --out-file sc/contracts/race_record/testdata/race_record_live_pre_untimed.wasm
```

## Why it is committed rather than fetched when the test runs

The rest of `mod upgrade` deploys today's build and upgrades it to today's build. That proves storage
survives an executable swap, but not what an in-place upgrade actually puts at risk: that records
written by the code **running on the chain** still decode under the new code. That needs two
genuinely different wasm files, and the "old" one has to be the artefact that really wrote the
records now living at `CCVW7WVC…` — not a copy of today's build.

`records_written_by_the_live_wasm_survive_the_untimed_upgrade` writes every lifecycle state the old
code can produce (`Entered`, `RacepackClaimed`, a timed `Finished`, `Dnf`) with these bytes, upgrades
to the current build, reads them all back unchanged, and then runs `record_finish_untimed` on records
the old code minted. It verifies for itself that the file is genuine: the host hashes it on upload
and the result is compared against `LIVE_PRE_UNTIMED_HASH`. The test touches no network, so CI can
run it.

Same pattern, same reasoning as `sc/contracts/event_registry/testdata/`.

## When to replace this file

Only after the next in-place upgrade has genuinely landed on testnet: fetch it again, and update the
hash in this table **and** `LIVE_PRE_UNTIMED_HASH` in `src/test.rs`. Do not replace it with the output
of a local `stellar contract build` — the moment this file becomes a copy of the current build, the
test stops proving anything.
