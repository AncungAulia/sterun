# `testdata/` — the wasm each upgrade replaced

No file here is a build artifact of this repo. All three were fetched from testnet, and each is the
executable that was genuinely running at `CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU`
at the moment the upgrade beside it was written:

| File | sha256 | What it is |
| --- | --- | --- |
| `event_registry_live_pre_allowlist.wasm` | `22bb432ecfd5480a7dbfe68949df2aa6ccd9c87c21db2b7ec9dd19bf6d032a2f` | EventRegistry v2.0.1, live before **STE-36** (the organiser allowlist) |
| `event_registry_live_pre_bib.wasm` | `cf0090331f199766af56c243a9de22c0581ea030b02940695851d64231fec3c0` | EventRegistry v2.2, live before **STE-54** (bibs unique within an event) |
| `event_registry_live_pre_quota.wasm` | `c8b5e82a2dde8366949cb6399d5b7eccdcbbc37d86ddd48a2adc61e40c9869cd` | EventRegistry v2.3, live before **STE-55** (`increase_quota`) |

Fetched from testnet as-is:

```bash
stellar contract fetch \
  --id CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU \
  --network testnet \
  --out-file sc/contracts/event_registry/testdata/event_registry_live_pre_quota.wasm
```

## Why it is committed rather than fetched when the test runs

The old `mod upgrade` deployed the contract from freshly built wasm and then upgraded to the **same**
wasm. That proves storage is not lost when the executable is replaced, but it does not prove the
thing STE-36 actually put at risk: that state written by the **old** code is still readable by the
**new** code. That needs two genuinely different wasm files, and the "old" one has to be the artefact
that really wrote the events now living on the chain — not a copy of today's build.

The tests touch no network (CI's `contracts.yml` has no testnet access, and a test that needs the
internet is a test that goes red one day because an RPC is down), so the bytes live in the repo. Each
test verifies for itself that its fixture is genuine: the host hashes it on upload and the result is
compared against the hash in the table above — the same hash the ledger reported for `CAPB6NQP…` and
the one frozen in `docs/specs/INTERFACE.md` §0.

| Test in `src/test.rs` | Fixture | What only that pair can prove |
| --- | --- | --- |
| `state_written_by_the_live_wasm_survives_the_allowlist_upgrade` | pre-allowlist | `DataKey::Organiser` was appended without orphaning `event_id` 0 |
| `bibs_issued_by_the_live_wasm_survive_the_event_wide_sequence` | pre-bib | the per-distance bibs already on chain still read back once bibs become event-wide |
| `a_quota_can_be_raised_on_a_category_the_live_wasm_created` | pre-quota | a category written by the running code — sold out, with entrants already counted against it — takes a larger quota and sells again |

The third one is the only test that can show the *absence* the ticket is about: the pre-quota
fixture has no `increase_quota` at all, so `try_increase_quota` failing against it is the sold-out
organiser's real position, asserted rather than described.

The second and third files needed no separate step to be trustworthy: at the time each was fetched,
the hash the ledger reported for `CAPB6NQP…` (`cf009033…`, then `c8b5e82a…`) was the same hash a
local `stellar contract build` of `main` produced. That is a coincidence of a branch that had not
diverged yet — `stellar contract fetch` is still how both were obtained, because a file copied out of
`target/` proves nothing about what the chain is running.

## Adding the next one

Each in-place upgrade adds a file here rather than overwriting the last: the old fixtures keep
proving the upgrades they were captured for (`Organiser` was appended safely; the bibs on chain
before STE-54 still decode), and a test that quietly lost its "before" would go green for the wrong
reason.

So, after the next upgrade has genuinely landed on testnet: **fetch** the executable that was live
before it, add a row above, and add its hash as a `LIVE_PRE_<change>_HASH` constant in `src/test.rs`
next to the others. Never substitute the output of a local `stellar contract build` — the moment one
of these becomes a copy of the current build, its test stops proving anything.
