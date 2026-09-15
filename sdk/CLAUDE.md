# `sdk/` — `@sterunxyz/sdk` (CLAUDE.md)

The TypeScript client for both contracts. Components **C5** (STE-15) + **C6** (STE-19: RaceRecord
JSON Schema v1.0, packaging, npm publish). Owner: **James**.

This is the seam **every** D3 client goes through — organiser console, entry flow, scanner PWA,
public profile — per the design rule that clients never talk to contracts raw
(`docs/SYSTEM_DESIGN.md` §2). The contract surface it represents is frozen in
[`docs/specs/INTERFACE.md`](../docs/specs/INTERFACE.md).

Published on npm: **<https://www.npmjs.com/package/@sterunxyz/sdk>**.

```bash
pnpm install
pnpm --filter @sterunxyz/sdk test        # no network at all
pnpm --filter @sterunxyz/sdk typecheck
pnpm --filter @sterunxyz/sdk lint
pnpm --filter @sterunxyz/sdk vendor      # refresh the vendored bindings after regenerating
pnpm --filter @sterunxyz/sdk e2e         # the full flow against live testnet
```

## The bindings are vendored, not `file:`-linked

`@sterunxyz/sdk` is published to npm, and **a `file:` dependency cannot be published**. So the
bindings code ships inside the package: `vendor/` holds a **byte-identical** copy of
`sc/bindings/*/src/index.ts`, compiled by `tsconfig.vendor.json` with the generator's own settings.

Why a separate tsconfig: under this package's `tsconfig.json` those two files raise 12 errors, all
of them about style rather than substance — type-only imports under `verbatimModuleSyntax`, a
missing `override`, and `window` without the DOM lib. Loosening the rules for the whole package to
accommodate two generated files is the wrong trade.

Why the copy must be byte-identical: `sc/bindings/README.md` forbids hand-editing, and a copy that
has been "adjusted" quietly stops being what the wasm produces. `test/vendor.test.ts` compares byte
for byte, so "regenerate the bindings and forget the SDK" is a red test rather than a published
client quietly speaking an older interface.

Refresh with `node scripts/vendor-bindings.mjs` (or `--check` to verify).

> **The `file:` trap from STE-15 is GONE.** Running `pnpm bindings` before `pnpm install` used to be
> mandatory, because pnpm copies a `file:` dependency into its store as a snapshot. There is no
> `file:` dependency at all now, so a clean clone just works and the CI step that existed to work
> around it has been removed. The vendor build is a pre-hook on `build`/`typecheck`/`test`.

## One `@stellar/stellar-sdk` version for the whole workspace

`stellar contract bindings typescript` (CLI 27.0.0) writes
`"@stellar/stellar-sdk": "^14.5.0"` into the `package.json` it generates, while `be/` and `sdk/` run
`^17.0.1`. Left alone, one graph contains **two** copies of the SDK — exactly the hazard described in
the header of `be/src/chain/reader.ts`: two RPC clients, and signer objects from one major handed to
an `AssembledTransaction` from another.

The answer is `pnpm.overrides` in the root `package.json`, not editing the bindings'
`package.json` — `sc/bindings/README.md` forbids hand edits, and the next regeneration would silently
undo it. The override states the same thing somewhere that survives.

Proven before relying on it: both bindings packages compile with `tsc` exit 0 against 17.0.1, and
read live testnet contracts through that version.

## Why errors are NOT taken from the bindings' own `Result`

This is the finding that shaped all of `tx.ts`. Probed against live contracts:

```
get_event(999)  -> result.unwrapErr()  === { message: "" }
owner_of(9999)  -> result === Err { error: { message:
                     "Indicates a non-existent `token_id`." } }
```

The first **throws the code away**. The second returns an `Err` whose type is `string`, carrying a
**Rust doc comment** — not a variant name, and not stable either, since editing a comment in the
contract would change it.

The only usable signal is `tx.simulation.error`: uniform across both, always shaped
`HostError: Error(Contract, #N)`. That is the input to `errors.ts`, and its band
(`INTERFACE.md` §3) decides which contract it came from. **Never** replace this with
`result.unwrapErr()` because it looks tidier — the result is an error with no identity.

## The error tables are duplicated from `be/src/chain/errors.ts` on purpose

This is not a missed DRY. `be/` deliberately does not depend on the bindings (reasoning in the
header of `be/src/chain/reader.ts`), and making the indexer depend on this package for three lookup
tables would undo that.

Instead both copies are pinned to the same frozen document by their own tests:
`sdk/test/errors.test.ts` and `be/test/chain-errors.test.ts` both parse `docs/specs/INTERFACE.md`.
Neither is the source of truth — **the frozen spec is**, and both are checked against it. This is
the same arrangement as `docs/specs/reference/{node,rust}`.

The tests here also compare the tables against the **generated** error maps in the bindings, closing
the triangle: document ↔ artefact (via `sc/scripts/check-interface.mjs`) and SDK ↔ both.

## Contract addresses are always arguments

There is no contract id as a constant anywhere in this package, matching rule 1 in `be/CLAUDE.md`.
The reason is even stronger here: a package already published to npm cannot read
`docs/deployments.md`, and a redeploy of a non-upgradeable contract means a **new address pair**
rather than an upgrade. A constant here would keep talking to the old pair until somebody shipped a
new version.

`network.ts` only holds what is genuinely a property of the *network*: `rpcUrl` and
`networkPassphrase`.

## `publicKey` is not an optional extra alongside `signTransaction`

`CallOptions` carries both, and both have to be right. `signTransaction` decides who signs;
`publicKey` decides the source account the transaction is **built and simulated** as, and it is the
simulation that records the auth entries. Simulating as the wrong address produces an auth tree for
that address, and a correct signature will not satisfy it.

That is why `runWrite` no longer accepts a signer: the signer goes in when the transaction is
assembled. Injecting a different signer at `signAndSend` time means signing something other than
what was simulated.

## Testing (MANDATORY, no bugs)

- **Unit + integration**: in `test/`, no network, through structural seams (`AssembledLike` in
  `tx.ts` and the `bindings` option on `SterunClient`) — the same pattern as `ContractCaller` in
  `be/`. This is what runs in `typescript.yml`.
- **E2E**: `scripts/e2e.ts` against live testnet, plus negative cases that each assert both the
  variant **and** its band. The evidence is committed to `docs/deployments.md`.

**`typescript.yml` must never touch the network.** That was decided in STE-6 and still holds: CI
must not go red because testnet is having a bad afternoon. E2E is run by hand and its output becomes
written evidence — the same pattern as the faucet (STE-6) and STE-16.

## JSON Schema: one definition, two artefacts

The zod schema in `src/schema.ts` is the **source of truth**. `schema/race-record-v1.0.json` is
*generated* from it through `z.toJSONSchema`, and `test/schema.test.ts` fails when the committed
file and the generated one differ. Never hand-edit the JSON.

**Every object uses `strictObject`, not `object`.** zod's default is to **strip** unknown keys and
report success — which makes the runtime validator and the published JSON Schema
(`additionalProperties: false`) quietly disagree: an outside validator would reject a document this
SDK just called valid. And for the property that matters most, silence is the wrong answer: a
document arriving with `national_id` in it is not a valid document with a stray field, it is
evidence that something is leaking PII into a format designed to be handed to strangers.

**Large numbers are always decimal strings** (`price_stroops`, `starts_at`, `entered_at`,
`claimed_at`, `result_at`). `JSON.parse` produces IEEE-754 doubles; above 2^53 precision is lost
silently, and `price_stroops` is an `i128`. `u32` fields stay numbers.

## Paid add-ons (STE-37)

Four methods, deliberately **twins** of the existing category pair, because they are the same idea:
per-event, id-addressed, priced in stroops, stock-limited.

| write | read |
| --- | --- |
| `addAddon({ eventId, code, priceStroops, quota }, actor)` | `getAddon(eventId, addonId)` |
| | `listAddOns(eventId)` · `addonCount(eventId)` |

Two decisions worth writing down so they are not reopened:

**Prices in stroops, not decimals.** Same as `addCategory`, and for the same reason as rule 3 in
`be/CLAUDE.md`: money never travels through a float. A 50 sUSD jersey is `500_000_000n`. The round
trip through a `double` that `50.0` invites is off by a stroop often enough to make `enter` revert
with no explanation.

**`listAddOns` fans out N+1, and that is not laziness.** EventRegistry exposes `addon_count` and
`get_addon` and nothing that returns them together — itself a deliberate contract-side choice,
because a view returning an unbounded vector gets more expensive as an event grows. So the cost sits
here, where a caller can see it, instead of hidden in a helper.

> **`reserve_addon` is NOT wrapped, and must not be added.** It calls
> `race_record.require_auth()` (`sc/contracts/event_registry/src/lib.rs`), so it is a
> cross-contract step inside `enter` — not something a client may call. Wrapping it would only hand
> people a method that **always** reverts.

`SterunAddOn` uses `unitsLeft` where the category uses `slotsLeft`. The shape is identical on
purpose; that one word differs because a category sells a place in a race and an add-on sells a
thing off a shelf, and calling a jersey a "slot" reads as a copy-paste rather than a decision.

## Not done yet

- **The paid `enter` leg in e2e** — needs `SUSD_DISTRIBUTOR_SECRET` in `be/.env`. The script already
  handles it, and when the secret is missing it **says** it is skipping that leg rather than quietly
  passing a weaker test.
- **`STERUN_ADMIN_SECRET` is now REQUIRED for e2e** (STE-36). `create_event` is gated by the admin's
  organiser allowlist, and an organiser cannot grant themselves access — that is the point of the
  gate. So the script calls `addOrganiser` for the throwaway wallet it creates, then proves the gate
  from the negative side: an address that is not allowlisted is refused with
  `NotAllowlistedOrganiser(18)`. Without the secret the script **fails hard** rather than skipping a
  step — no event means nothing after it can run either.
