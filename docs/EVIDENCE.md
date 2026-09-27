# Evidence pack — Sterun, Instawards 30-day engagement

One page, for the Ambassador Chapter Lead. Everything below is a link you can open without
installing anything, without a wallet, and without asking us for access.

It follows §6.1 of the SOW, one section per deliverable, in the order the checklist in §6.2 asks
for them. Where something is **not done yet**, the row says so and names the date it is expected,
rather than being left out.

Last updated: **2026-09-27**. Network: **Stellar testnet** throughout.

---

## Start here — three links that show the product working

| | Link | What you are looking at |
| --- | --- | --- |
| The app | [app.sterun.xyz](https://app.sterun.xyz) | Race directory, a race page, a runner's public record. No wallet needed to browse. |
| The landing page | [sterun.xyz](https://sterun.xyz) | What Sterun is, for an organiser who has never heard of it. |
| The SDK | [npmjs.com/package/@sterunxyz/sdk](https://www.npmjs.com/package/@sterunxyz/sdk) | The published package, version 0.3.1, with its quick start and method reference. |

The source is one public repository: **[github.com/AncungAulia/sterun](https://github.com/AncungAulia/sterun)**.

---

## Deliverable 1 — the contracts

> SOW: *public GitHub repo, testnet contract IDs, tx hashes (stellar.expert links), coverage report.
> Every lifecycle transition exercised on testnet with linked transactions, including the rejected
> duplicate-claim path. `cargo test` output showing coverage above 80%.*

| Evidence | Link | What it proves |
| --- | --- | --- |
| EventRegistry (C1), live | [`CAPB6NQP…SHJU`](https://stellar.expert/explorer/testnet/contract/CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU) | Races, distances, quota, prices, the organiser allowlist and the scanner list, on chain. |
| RaceRecord (C2), live | [`CCVW7WVC…A6NW`](https://stellar.expert/explorer/testnet/contract/CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW) | The race records themselves: entry, race pack, finish. |
| sUSD, the entry-fee token | [`CBQ6444F…MOOU`](https://stellar.expert/explorer/testnet/contract/CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU) | Entries are paid in a SEP-41 token, not in a placeholder. |
| Full deployment record | [`docs/deployments.md`](https://github.com/AncungAulia/sterun/blob/main/docs/deployments.md) | Every deploy and every upgrade, with its transaction hash, its wasm hash read back from the chain, and the date. |
| The frozen interface | [`docs/specs/INTERFACE.md`](https://github.com/AncungAulia/sterun/blob/main/docs/specs/INTERFACE.md) | Every function signature, who may call it, every error code. Derived from the compiled wasm rather than retyped, and a CI job fails if the two ever disagree. |
| Tests and coverage | [latest run on `main`](https://github.com/AncungAulia/sterun/actions/runs/35989896509) | Open the run summary: the wasm hashes and the coverage table are printed there, so they can be read with no Rust installed. The gate is 80 per cent; the contracts are at 99. |

**Every lifecycle transition on testnet, with links:** `docs/deployments.md` §"On-chain sanity check"
walks one runner from `enter` to `RacepackClaimed` to `Finished`, each with its transaction, and the
section after it fires every guard that should refuse (full distance, closed race, a second race
pack, a finish before check-in, a stranger's signature).

**The duplicate-claim path, rejected, on a real network:** two desks claimed the same runner in the
same ledger; the chain kept one and refused the other with `AlreadyClaimed` (error 102). Written up
in `docs/deployments.md` §"STE-61 — a same-ledger claim race, reproduced on live testnet".

**The address has not changed since it was deployed.** The contracts are upgradeable, and four
features were added in place after launch (organiser allowlist, finish without a time, event-wide
bib numbers, raising a sold-out quota). Each upgrade is recorded with the transaction that did it
and a read-back of the data that survived it.

---

## Deliverable 2 — the SDK and the schema

> SOW: *npm package link, schema document, recorded SDK run. Published package on npmjs.com with
> README and examples. RaceRecord JSON schema v1.0. Recording of the SDK creating an event, issuing
> a record, and verifying it against testnet.*

| Evidence | Link | What it proves |
| --- | --- | --- |
| Published package | [`@sterunxyz/sdk` 0.3.1](https://www.npmjs.com/package/@sterunxyz/sdk) | Anyone can `npm install` it. Published 2026-09-16. |
| Quick start and API reference | the same page | The README renders on npm: a quick start, a method reference, the errors a caller can branch on, and the document format. |
| JSON schema v1.0 | [`sdk/schema/race-record-v1.0.json`](https://github.com/AncungAulia/sterun/blob/main/sdk/schema/race-record-v1.0.json) | A race record has one published shape that another system can validate against. |
| The hash and code definitions | [`docs/specs/HASH_AND_TOTP.md`](https://github.com/AncungAulia/sterun/blob/main/docs/specs/HASH_AND_TOTP.md) | How a runner's identity is hashed and how the check-in code is derived, byte by byte, with test vectors two independent implementations are checked against. |
| The API the app runs on | [api.sterun.xyz](https://api.sterun.xyz/config) | The live backend, answering with the contract addresses it is pointed at. |
| Recorded SDK run | [sterun-sdk-e2e-testnet-2026-09-27.mp4](https://drive.google.com/file/d/1UFF2HPFzeD4MHnQCcWqo7yumtLIJ1gPI/view?usp=sharing) | The SDK alone, against live testnet: a race created, distances and add-ons added, entries opened, a runner entered and paid 5 sUSD, checked in, finished, then verified with no wallet at all. Every refusal the protocol owes is in it too, including a wallet that is not allowlisted being refused a race. |

**The package was checked as a package, not as source.** Before publishing, the tarball was
installed into an empty TypeScript project outside this repository, typechecked there, and used to
read the live contracts. The same check was repeated after publishing.

---

## Deliverable 3 — the web app, the scanner and the demo

> SOW: *live demo link, demo video (3 min or less), screenshots. Dashboard browsing the event
> directory and runner profiles. The full loop on video: create event, enter and pay, scan QR, claim
> race pack, record finish, verify on the public profile, plus both fraud attempts being rejected.*

| Evidence | Link | What it proves |
| --- | --- | --- |
| The live app | [app.sterun.xyz](https://app.sterun.xyz) | The directory and every race page read straight from the chain. No database, no wallet, no login. |
| A runner's public record | [app.sterun.xyz/runner](https://app.sterun.xyz/runner) | Paste any address and read that runner's races. This is the page a runner sends to somebody who wants proof. |
| The organiser's way in | [app.sterun.xyz/organisers](https://app.sterun.xyz/organisers) | What publishing a race involves, and how to ask for access. |
| The landing page | [sterun.xyz](https://sterun.xyz) | The product explained for someone who runs races. |
| Deployment record | [`docs/deployments.md` §STE-32](https://github.com/AncungAulia/sterun/blob/main/docs/deployments.md) | When each of the three went live, and where. |
| The full loop, rehearsed | [`docs/rehearsal/runs/`](https://github.com/AncungAulia/sterun/tree/main/docs/rehearsal/runs) | Five runs on live testnet. The last one: **51 passed, 0 failed, 6 steps that need a person**. Every step names what it proves and links its transactions. |
| **Demo video, 3 minutes or less** | **not yet** | The full loop end to end, plus both fraud attempts refused. |
| Screenshots | partly | The directory is done. A race, a pass, the scanner and a finished record come with the video. |

### What the rehearsal actually covers

One run, on live testnet, with real transactions: a race is created and opened, nine runners pay in
sUSD, one distance sells out and a second batch is opened, two volunteer desks go offline and check
runners in, signal returns and the claims are sent, a results file is uploaded and corrected, nine
results are recorded, and every runner's record is then verified by an outsider with no wallet.
Alongside it, the refusals: a wallet that is not allowed to publish a race, an entry after the race
sold out, an entry into a closed race, an entry into a cancelled race, a stranger trying to check
somebody in, a finish recorded for a runner who never collected a race pack, and a results file
re-uploaded after it was published.

### The two deliberate fraud attempts

Both are in the harness and in every run since 2026-09-24.

**A duplicate race pack collection.** Covered three ways: the same desk scanning one runner twice
while offline, the same desk sending that claim to the chain twice, and two desks that both checked
in the same runner while offline. In every case exactly one race pack is recorded, the loser is
refused by the contract, and the desk that lost is told which runner to look at.

**A forwarded QR screenshot.** A code is captured, left to go stale, then presented at a desk and
refused, after which the runner's live pass is accepted. What this proves is stated carefully, and
it is worth repeating here in the same words the rehearsal uses:

> a screenshot goes stale in under a minute, and even a fresh one can only be used once

It does **not** prove that a forwarded QR is always rejected, because that would not be true: a
desk accepts a code within one step either side, so a screenshot shown within roughly thirty to
sixty seconds still works. The protection is the pair: the code turns over every thirty seconds,
and the race pack can only be handed over once. The step is in the harness
(`docs/rehearsal/src/stale-qr.ts`) with its own tests, and it is in the evidence of every run since
2026-09-24 as **F.1**.

---

## What is not claimed

Stated here so nobody has to find it out later:

- **There is no escrow.** The entry fee moves straight from the runner to the organiser in one
  transaction, so the contract never holds the money and no refund can be forced by anyone. Refunds
  are an off-chain promise between a runner and an organiser.
- **Every race on the demo is ours.** The four in the directory were seeded by this team to exercise
  the system, with posters and 25 records between them. No real event has been recorded on Sterun
  yet, and that, rather than any feature, is what we consider the measure of whether this project
  should continue.
- **Testnet, not mainnet.** Entries are paid in sUSD, a test token we issue. Nothing here has moved
  real money.
- **The contracts moved three times since this page was first written**, each in place at the same
  address: entries closing on their own at the registration date, many results in one signature, and
  many race packs handed over in one signature. The evidence for each is in `docs/deployments.md`.

---

## For the checklist in §6.2

| Deliverable | Present | Partial | Missing |
| --- | --- | --- | --- |
| 1 — contracts | ✅ | | |
| 2 — SDK and schema | ✅ | | |
| 3 — app, scanner, demo | | ⚠️ the demo video is outstanding | |
