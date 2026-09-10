# `sc/bindings/` — TypeScript bindings for the Sterun contracts (STE-14, C3)

TypeScript clients for both contracts, **generated** from the build output in
`sc/target/wasm32v1-none/release/`. This is the D2 handoff: what **James** (`SterunClient`, STE-15;
the indexer, STE-16) and **Ancung** (the web app + scanner PWA, STE-17/18/21/22) use so that nobody
retypes a contract signature.

| Package | Contract | From wasm | wasm sha256 |
| --- | --- | --- | --- |
| [`event-registry/`](event-registry/) | EventRegistry (C1, v2.1) | `event_registry.wasm` | `cf0090331f199766af56c243a9de22c0581ea030b02940695851d64231fec3c0` |
| [`race-record/`](race-record/) | RaceRecord (C2, v2.0.1) | `race_record.wasm` | `27749180046a9a4e62e85ec46cb6b61cd35a0914db4f4eb61d66616febd4302b` |

The frozen contract they represent: **[`docs/specs/INTERFACE.md`](../../docs/specs/INTERFACE.md)
v2.1.0**. These bindings talk to the **v2 pair of addresses**; the v1 addresses that are still live
run v1 wasm with a different `enter` signature, so do not cross the two.

If this document and the files here disagree, **the document is right** — and the disagreement is
itself a bug (see "The guard" below).

> RaceRecord's wasm hash changed once **without** the bindings changing (an internal optimisation,
> `c90a4281…` → `27749180…`). That is normal: the generator reads the *interface*, and the interface
> was identical. So an empty `git diff` after regenerating does not mean you forgot to build — check
> the hash.

---

## DO NOT hand-edit

Everything in `event-registry/` and `race-record/` is **generator output**, including `src/index.ts`,
`tsconfig.json`, `package.json`, and the `README.md` inside each package. A hand edit disappears
without trace at the next regeneration and, worse, makes the bindings lie about what is actually in
the wasm.

Need a change? Change the contract, rebuild, regenerate — through the spec-change procedure in
[`docs/specs/CHANGELOG.md`](../../docs/specs/CHANGELOG.md) (approval from @Axel + @fable, a changelog
entry, a version bump). Error codes are **never renumbered**.

> The stock `README.md` inside each package is generator boilerplate and is **misleading** for this
> repository: it suggests regenerating from a `--contract-id` via `postinstall`. We do not do that —
> we generate from local wasm and commit the result. This file is what applies.

## Regenerating

Exactly these two commands, run from the **repository root**:

```bash
cd sc && stellar contract build && cd ..

stellar contract bindings typescript \
  --wasm sc/target/wasm32v1-none/release/event_registry.wasm \
  --output-dir sc/bindings/event-registry --overwrite

stellar contract bindings typescript \
  --wasm sc/target/wasm32v1-none/release/race_record.wasm \
  --output-dir sc/bindings/race-record --overwrite
```

Two notes that determine the result:

- **`--output-dir` determines the package name.** The generator takes the package name from the
  output directory's basename, so `--output-dir sc/bindings/event-registry` is what makes the package
  called `event-registry`. A different path means a differently named package means broken `import`s
  in `be/` and `fe/`. Do not change it.
- **The output is deterministic.** With the same wasm and the same `--output-dir`, the generated
  `src/index.ts` and `tsconfig.json` are **byte-identical** to what is committed. So an empty
  `git diff` after regenerating means the bindings genuinely are still in sync with the wasm.

The generator needs no network and no deployed contract — `--wasm` is read from a local file. That is
why STE-15/16/17 did not have to wait for STE-33.

## Building (required before consumption)

The generated `package.json` points `exports` at `./dist/index.js`, and `dist/` is **not committed**
(see the `.gitignore` in this folder). So after a clone:

```bash
cd sc/bindings/event-registry && npm install && npm run build
cd ../race-record            && npm install && npm run build
```

`npm run build` runs `tsc` and produces `dist/index.js` + `dist/index.d.ts`. Both packages **compile
as they are, with no hand fixes at all**. This is also a step in CI
(`.github/workflows/contracts.yml`), so if the generator ever emits something that does not compile,
CI goes red before anyone can consume it.

## How `be/` and `fe/` use them

**Through a `file:` dependency, not the pnpm workspace.** `be/`, `sdk/`, `fe/` and `landing-page/`
are one pnpm workspace, but `sc/bindings/*` deliberately is not a member: it is generator output
consumed as an artefact, and making it a workspace member would put a package nobody may edit into
the same install graph as the packages people work in. `file:` behaves the same under npm and pnpm.

`be/package.json` (and identically for `fe/package.json`):

```json
{
  "dependencies": {
    "event-registry": "file:../sc/bindings/event-registry",
    "race-record": "file:../sc/bindings/race-record"
  }
}
```

Then:

```ts
import { Client as EventRegistry, Errors as RegistryErrors } from "event-registry";
import { Client as RaceRecord, Errors as RecordErrors, NonFungibleTokenError } from "race-record";

const registry = new EventRegistry({
  contractId: EVENT_REGISTRY_ID,       // from docs/deployments.md (STE-33)
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
});

const tx = await registry.get_event({ event_id: 1 });
console.log(tx.result);                // Result<EventData, Error>
```

Demonstrated: a probe package with the two `file:` dependencies above passes `tsc --noEmit` under
**`"strict": true`** and imports successfully at runtime
(`RegistryErrors[5].message === "QuotaFull"`,
`RecordErrors[102].message === "AlreadyClaimed"`,
`NonFungibleTokenError[200].message === "NonExistentToken"`).

> **`sdk/` is the exception, and for a reason worth knowing.** `@sterunxyz/sdk` is published to npm,
> and a published package cannot carry a `file:` dependency. So `sc/bindings/*/src/index.ts` is
> *vendored* into `sdk/vendor/` as a byte-identical copy, and `sdk/test/vendor.test.ts` fails if the
> copy drifts. Regenerating the bindings without refreshing the SDK is therefore a red test, not a
> silent divergence. Refresh with `pnpm --filter @sterunxyz/sdk vendor`.

### Three things that confuse people unless stated

1. **There is no `networks` export.** Bindings generated from a `--contract-id` usually carry a
   `networks` constant holding the contract id. Ours are generated from `--wasm`, so there is no
   contract id inside them — you **must** supply `contractId` yourself in `new Client({...})`. Take
   it from `docs/deployments.md` (see the bottom of this file), rather than hardcoding it in several
   places.
2. **`__constructor` is not a method.** It becomes an argument to the static `Client.deploy({...})`,
   because a constructor only runs once, at deploy. That is STE-33's business, not a day-to-day
   client concern.
3. **`version` in `package.json` says `0.0.0`.** That is what the generator emits, and we
   deliberately do **not** change it, so the output stays byte-identical to a regeneration. The
   meaningful version is the spec version they represent — **v2.1.0**, recorded in
   `docs/specs/CHANGELOG.md` — plus the wasm sha256 in the table at the top. Both of those are
   verifiable identities; the number in `package.json` is not.

## Error codes: the number itself names its origin

Each package's `Errors` maps a code to a name, exactly as in `INTERFACE.md` §1.4 and §2.4:

| Package | Export | Band |
| --- | --- | --- |
| `event-registry` | `Errors` | `1..=18` (EventRegistry, C1) |
| `race-record` | `Errors` | `100..=107` (RaceRecord, C2) |
| `race-record` | `NonFungibleTokenError` | `200..=214` (OpenZeppelin) |

`enter` calls EventRegistry and the SAC cross-contract, and their reverts propagate unchanged. So an
`Error(Contract, #4)` out of `enter` is **not** a RaceRecord error — it is EventRegistry's
`EventNotOpen`. These bands are what let `SterunClient` (STE-15) pick the right error map from the
number alone. The full detail: `INTERFACE.md` §3.

## The guard: bindings must not quietly differ from the frozen spec

```bash
node sc/scripts/check-interface.mjs
```

That script *diffs* **three** sides at once and exits non-zero if any of them has diverged:

1. the built wasm (`stellar contract info interface --output json`),
2. the frozen tables in `docs/specs/INTERFACE.md`,
3. the `*/src/index.ts` files in this folder.

What it guards: every frozen function has a client method (or `Client.deploy` for `__constructor`),
and every frozen error code appears in an error map under the same name. It runs automatically in CI
on every push and pull request.

## Its relationship to the deploy (STE-33)

The wasm that produced these bindings is **exactly** the wasm STE-33 deployed — its sha256 is in the
table at the top and in `sc/README.md`. The contract ids from that deploy land in
**`docs/deployments.md`** along with their stellar.expert links.

The live contract ids, ready for `new Client({ contractId })`. The bindings in this folder are
generated from **v2** wasm, so the v2 pair is what matches:

```
# v2 (STE-35) — what these bindings match
EVENT_REGISTRY=CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU
RACE_RECORD=CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW

# v1 (STE-33) — still live, `enter` without `addon_ids`. Needs v1 bindings.
# EVENT_REGISTRY=CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64
# RACE_RECORD=CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4
```

The on-chain wasm hash of both contracts is **exactly** the hash in the table at the top of this file
— checked with `stellar contract info hash --contract-id`. So these bindings genuinely represent the
contracts people call, not some other, similar build.
