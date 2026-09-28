# Sterun — Instawards Final Report

As of **2026-09-28**. Network: **Stellar testnet** throughout.

Sterun is a non-transferable race record protocol for running events on Stellar. All three 30-day
deliverables are built and live on Stellar testnet: the two contracts, the published
`@sterunxyz/sdk`, and the deployed web app, organiser console and race-day scanner. All three
deliverables are complete, with the demo video filed under Deliverable 3.

> This is the submission report, in the five sections Instawards asks for. The working evidence
> index it is drawn from is [`EVIDENCE.md`](EVIDENCE.md), which is organised by SOW §6.1 instead and
> is the one to update as gaps close.

---

## 1. Project & Team Information

| Field | Value |
| --- | --- |
| Project name | Sterun |
| What it is | A non-transferable race record protocol for running events on Stellar / Soroban |
| Landing page | [sterun.xyz](https://sterun.xyz) |
| Web app | [app.sterun.xyz](https://app.sterun.xyz) |
| API | [api.sterun.xyz](https://api.sterun.xyz) |
| Repository | [github.com/AncungAulia/sterun](https://github.com/AncungAulia/sterun) |
| Released version | [`@sterunxyz/sdk` 0.3.1](https://www.npmjs.com/package/@sterunxyz/sdk), published 2026-09-16 |
| Network | Stellar testnet. No mainnet deployment, no real money |
| Team | Axel (project lead, Stellar Ambassador Yogyakarta) · James (contracts, backend, SDK) · Aulia (web app, organiser console, scanner) · Nabil (landing page, design) |
| Contact | axelmatsama@gmail.com |

---

## 2. Scope of Work (30-Day Deliverables)

### In-Scope Deliverables

| # | Deliverable | Description | Status | Proof |
| --- | --- | --- | --- | --- |
| 1 | The contracts (C1 + C2) | EventRegistry holds races, distances, quota, prices, the organiser allowlist and the scanner list. RaceRecord holds the record itself through entry, race pack and finish, and exports no transfer, approve or burn. | Complete | [EventRegistry](https://stellar.expert/explorer/testnet/contract/CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU) · [RaceRecord](https://stellar.expert/explorer/testnet/contract/CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW) · [deployments.md](deployments.md) |
| 2 | `@sterunxyz/sdk` and the JSON schema | A TypeScript client for both contracts, published to npm, plus the RaceRecord JSON schema v1.0 and the frozen hash and check-in-code definitions. The backend that carries the PII vault, the indexer and the roster runs on it. | Complete | [npm package](https://www.npmjs.com/package/@sterunxyz/sdk) · [schema v1.0](../sdk/schema/race-record-v1.0.json) · [recorded run](https://drive.google.com/file/d/1UFF2HPFzeD4MHnQCcWqo7yumtLIJ1gPI/view?usp=sharing) |
| 3 | Web app, organiser console and race-day scanner | The public race directory and runner records, the entry and payment flow, the QR pass, the offline scanner desk, and the organiser console that publishes a race and its results. | Complete | [app.sterun.xyz](https://app.sterun.xyz) · [sterun.xyz](https://sterun.xyz) · [screenshots](shots/) · [demo video](https://drive.google.com/drive/folders/1m0ySycpJ5AHrVxLTEMcqSe_4I5bXn5sU?usp=sharing) · [on X](https://x.com/sterunxyz/status/2104224544332644623) |

All three run against **Stellar testnet**. Entries are paid in sUSD, a SEP-41 test token issued by
the team; no real money has moved, and there is no escrow, so a refund is an organiser's promise
made outside Sterun.

---

## 3. Evidence of Completion

### Evidence Submitted

| # | Evidence type | What it is, and what it proves |
| --- | --- | --- |
| 1 | Live contracts, transaction records, coverage report | Both contracts are readable on stellar.expert. [`deployments.md`](deployments.md) records every deploy and every in-place upgrade with its transaction hash and the wasm hash read back from the chain, and walks one runner from `enter` to race pack to finish with a link per step. The section after it fires every guard that should refuse, including the duplicate claim. Coverage is printed in the [CI run summary](https://github.com/AncungAulia/sterun/actions/runs/35989896509): the gate is 80 per cent and the contracts are at 99. |
| 2 | Published npm package, JSON schema, recorded terminal run | [`@sterunxyz/sdk` 0.3.1](https://www.npmjs.com/package/@sterunxyz/sdk) installs from npm with its README, quick start and method reference. [Schema v1.0](../sdk/schema/race-record-v1.0.json) fixes the record's shape; [`HASH_AND_TOTP.md`](specs/HASH_AND_TOTP.md) fixes the identity hash and the check-in code, with vectors two implementations are checked against. The [recorded run](https://drive.google.com/file/d/1UFF2HPFzeD4MHnQCcWqo7yumtLIJ1gPI/view?usp=sharing) drives live testnet through the SDK alone: a race created, a runner entered and paid, checked in, finished, then verified with no wallet. |
| 3 | Deployed URLs, screenshots, rehearsal evidence | The [app](https://app.sterun.xyz) and [landing page](https://sterun.xyz) are live on Vercel, the API on a VPS behind Cloudflare. [`shots/`](shots/) holds nine pages of the deployed app at phone and laptop widths. [`rehearsal/runs/`](rehearsal/runs/) holds five scripted end-to-end runs against live testnet; the last is **51 passed, 0 failed, 6 steps that need a person**. |

**What the rehearsal does and does not drive.** It drives the real contracts, the real API and the
web app's own scanner code, but not the React screens, a browser wallet prompt or a camera reading a
QR from a screen. Those six steps are marked `MANUAL REQUIRED` in every run rather than simulated,
and the demo video shows all six being done by a person.

---

## 4. Evidence Verification Checklist

| # | Deliverable | Present | Partial | Missing | Comments |
| --- | --- | --- | --- | --- | --- |
| 1 | The contracts | ✓ | | | Live on testnet, 99 per cent coverage against an 80 per cent gate. Upgraded in place five times without the address changing, each upgrade recorded with the data read back afterwards. |
| 2 | SDK and schema | ✓ | | | Published to npm. The tarball was installed into an empty project outside this repository, typechecked there and used to read the live contracts, before publishing and again after. |
| 3 | Web app, scanner, demo | ✓ | | | Built, deployed, and proven twice over: five scripted runs on live testnet, and the demo video, which shows the six steps a script cannot reach — the React screens, a browser wallet prompt, and a camera reading a QR from a phone. Screenshots of the deployed app are filed alongside. |


---

## 5. Supporting Files

| Code | File | Link |
| --- | --- | --- |
| L01 | Repository | [github.com/AncungAulia/sterun](https://github.com/AncungAulia/sterun) |
| L02 | EventRegistry (C1), live on testnet | [`CAPB6NQP…SHJU`](https://stellar.expert/explorer/testnet/contract/CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU) |
| L03 | RaceRecord (C2), live on testnet | [`CCVW7WVC…A6NW`](https://stellar.expert/explorer/testnet/contract/CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW) |
| L04 | sUSD, the entry-fee token | [`CBQ6444F…MOOU`](https://stellar.expert/explorer/testnet/contract/CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU) |
| L05 | Deployment and upgrade record | [`docs/deployments.md`](deployments.md) |
| L06 | Frozen interface: signatures, callers, error codes | [`docs/specs/INTERFACE.md`](specs/INTERFACE.md) |
| L07 | Tests and coverage, in the run summary | [CI run on `main`](https://github.com/AncungAulia/sterun/actions/runs/35989896509) |
| L08 | Published SDK | [`@sterunxyz/sdk` 0.3.1](https://www.npmjs.com/package/@sterunxyz/sdk) |
| L09 | RaceRecord JSON schema v1.0 | [`sdk/schema/race-record-v1.0.json`](../sdk/schema/race-record-v1.0.json) |
| L10 | Identity hash and check-in code, with vectors | [`docs/specs/HASH_AND_TOTP.md`](specs/HASH_AND_TOTP.md) |
| L11 | Recorded SDK run against live testnet | [sterun-sdk-e2e-testnet-2026-09-27.mp4](https://drive.google.com/file/d/1UFF2HPFzeD4MHnQCcWqo7yumtLIJ1gPI/view?usp=sharing) |
| L12 | Web app | [app.sterun.xyz](https://app.sterun.xyz) |
| L13 | Landing page | [sterun.xyz](https://sterun.xyz) |
| L14 | Live API, reporting the contracts it points at | [api.sterun.xyz/config](https://api.sterun.xyz/config) |
| L15 | A runner's public record | [one address, three races](https://app.sterun.xyz/runner/GDLFVS26CWYAH5CK6RN7Z23Q7MLOOWIXHD4NNLSEU7GASERIF463PTC5) |
| L16 | Screenshots of the deployed app | [`docs/shots/`](shots/) |
| L17 | Five scripted runs on live testnet | [`docs/rehearsal/runs/`](rehearsal/runs/) |
| L18 | The evidence index this report is drawn from | [`docs/EVIDENCE.md`](EVIDENCE.md) |
| L19 | System design, C1 to C14 | [`docs/SYSTEM_DESIGN.md`](SYSTEM_DESIGN.md) |
| L20 | Demo video recording | [Sterun Demo Video](https://drive.google.com/drive/folders/1m0ySycpJ5AHrVxLTEMcqSe_4I5bXn5sU?usp=sharing) |
| L21 | The demo video, posted publicly | [@sterunxyz on X](https://x.com/sterunxyz/status/2104224544332644623) |
