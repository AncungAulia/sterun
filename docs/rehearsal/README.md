# STE-25 — the mock race rehearsal

A full race, run on **live testnet** against the **live backend**
(`https://api-sterun.jameshub.fun`) and the v2 contracts in
[`../deployments.md`](../deployments.md): an organiser creates a race, runners enter and pay
sUSD, two volunteer desks check them in offline, results are uploaded and recorded, and anyone
verifies the records from chain afterwards.

```bash
docs/rehearsal/run.sh        # 15–20 minutes; evidence in docs/rehearsal/runs/<UTC time>/
```

Needs Node ≥ 22, pnpm, network, and `STERUN_ADMIN_SECRET` (testnet) in the repo-root `.env` —
the only key read from anywhere. Every other account is a fresh Friendbot account. Point it at
another backend with `STERUN_API_URL=…`.

Each run writes three files into its own directory, **while it runs**:

| File | What |
| --- | --- |
| `EVIDENCE.md` | step → tx hash / URL → status, then every observation per step |
| `evidence.json` | the same, machine-readable, plus the link-check result for every tx |
| `run.log` | stdout as it happened |

Nothing in them is written by hand. A failing step stays failing, with its error.

## The cast

| Role | Account | Runs |
| --- | --- | --- |
| admin | `STERUN_ADMIN_SECRET` | allowlists the organiser (STE-36) |
| organiser | fresh | `@sterunxyz/sdk`, what the console calls; signs the results preview |
| outsider | fresh, never allowlisted | the negative paths |
| R1–R9 | fresh, sUSD trustline, sUSD from `POST /faucet` | `POST /participants` + `enter`, what the entry flow calls |
| desk-A, desk-B | fresh scanner wallets | **a separate OS process each**, running the web app's scanner code |
| phones | — | a process running the pass's TOTP + QR code |

## The race

`STE-25 Rehearsal Run`: **R10K** (quota 4, 10 sUSD) and **R5K** (quota 4, 5 sUSD).

| Proof (ticket) | What happens |
| --- | --- |
| 1 | admin allowlists the organiser; organiser creates the race, two categories, opens it |
| 2 | R1–R4 enter R10K, R5–R8 enter R5K; sUSD balances of runner and organiser asserted before/after |
| 3 | R9 tries R10K when it is 4/4 → `QuotaFull(5)`, no sUSD moves |
| Q (STE-55) | organiser raises R10K to 5; the same number again → `QuotaNotIncreased(19)`; R9 enters, bib 9 |
| B (STE-53/54) | bibs are 1..9, unique in the event; chain = API = roster = what the desk screen shows |
| 4 | both desks download the roster online, go offline (fetch disabled), scan, then sync |
| 5 | desk-A scans R2 twice → local RED; a second on-chain claim → `AlreadyClaimed(102)` |
| 6 | **R4 is scanned at both offline desks**; both sync at the same moment; the chain keeps one, the other desk shows it in Flagged |
| 7 | a results CSV with R6 at 2:10 for 5 km and an unknown bib 999 is held at preview; the corrected file previews clean |
| 8 | 9 results recorded: timed, one **untimed** (R7, STE-41), one DNF (R3), one no-show as DNS (R8) |
| 9 | per runner: chain state, API `/records/:id`, `/runners/:addr/records`, and the `participant_hash` recomputed with the spec's reference implementation from the submitted fields + salt, then `verify` true, and false with one letter changed |
| N | non-allowlisted create (`18`); a non-organiser adding a category, cancelling, raising quota, adding a scanner; enter a Closed race and a Cancelled race (`EventNotOpen(4)`); a non-scanner claim (`104`); a finish before claim (`103`); re-uploading published results (`already_final`) |

Negative paths go through the web app's `readClient`, and the refusal is passed to the web app's
own `friendlyError` / `classifyEnterFailure`, so the evidence also records the **sentence a person
would see**.

## What is real and what is not

**Real:** every transaction (testnet, links in the evidence), every API call (the live
deployment), the scanner decision, queue, sync and flagged list (the web app's code, unmodified,
over IndexedDB via `fake-indexeddb`), the TOTP codes (the pass's code), the hash check (the frozen
spec's reference implementation).

**Not exercised, and marked `MANUAL REQUIRED` in every run, never simulated:**

- the React screens: the console, the entry form, the pass, the desk, the flagged page;
- a browser wallet's signing prompt (a `Keypair` signs instead);
- a camera decoding the QR from a screen (the QR *text* is handed to the desk's decoder);
- two physical phones for proof 6 — `M.3` in the evidence says exactly what two people must do;
- the public profile page (STE-24 is not built) and the deployed web app/landing (STE-32 is not
  deployed: `sterun.xyz` is a parked domain).

Out of scope for STE-25 and left to Axel: screen footage, the team walkthrough, the demo video.

## How it is built

`src/mock-race.ts` is the stage manager, `src/device.ts` a desk or phone, `src/evidence.ts` the
writer. `run.sh` bundles them with esbuild into `be/node_modules/.cache/` and
`fe/node_modules/.cache/` — inside the package whose dependencies each one imports — so the
rehearsal adds no workspace member, no lockfile change and no file in a teammate's folder.

The writer refuses to write a file containing a Stellar secret seed or any secret value the run
has handled (the admin key, fresh keys, salts, check-in secrets), and `run.sh` greps the run
directory once more at the end.

## Runs

Every run is committed as it came out, failures included.

| Run | Event | Result | Links | What it showed |
| --- | --- | --- | --- | --- |
| [`2026-09-16T15-21-11Z`](runs/2026-09-16T15-21-11Z/EVIDENCE.md) | 24 | 31 PASS · 17 FAIL · 6 MANUAL | 47/47 | the two-desk race: the losing desk's claim failed on the ledger with `AlreadyClaimed(102)`, the scanner stopped its whole queue with "Something went wrong" and never flagged it; the script did not press Send again, so 12 later steps failed in cascade, and 5.2 made a first claim it believed was a second |
| [`2026-09-16T15-40-07Z`](runs/2026-09-16T15-40-07Z/EVIDENCE.md) | 26 | **48 PASS · 1 FAIL · 6 MANUAL** | 61/61 | the same bug reproduced with the other desk losing (step 4.3, the one FAIL); pressing Send again, as the screen says, flagged it and sent the rest; everything after it green |
| [`2026-09-16T18-02-01Z`](runs/2026-09-16T18-02-01Z/EVIDENCE.md) | 34 | **49 PASS · 0 FAIL · 6 MANUAL** | 61/61 | after STE-61 (SDK) and STE-62 (scanner): both desks pressed Send once, desk-B's claim for R4 failed on the ledger with `AlreadyClaimed(102)` in the winner's ledger (`10e261cf…`), the desk flagged it "Already collected elsewhere" and sent the rest; no desk stopped. Run with the desk fix `d3f20f6` applied before it was committed, hence `+uncommitted` in its header |

### Run 2 against the nine proofs in the ticket

| # | Proof | Status | Where |
| --- | --- | --- | --- |
| 1 | create event | ✅ via SDK · ✋ console UI | 1.1, 1.2 · M.1 |
| 2 | 8 entries, sUSD runner → organiser | ✅ balances asserted per entry · ✋ entry UI | 2.R1–2.R8, X.1 · M.2 |
| 3 | enter a full category → `QuotaFull` | ✅ | 3.1 |
| 4 | offline claim, then sync | ✅ | 4.1, 4.2, 4.4, X.2 |
| 5 | double claim → local RED and `AlreadyClaimed` on chain | ✅ | 5.1, 5.2 |
| 6 | two offline desks, one winner, flag appears | ❌ first press (STE-61, STE-62) · ✅ after the second press · ✋ two phones | 4.3 · 6.1 · M.3 |
| 7 | CSV with an anomaly held at preview | ✅ | 7.1, 7.2 |
| 8 | results recorded | ✅ 9 transactions (no batch call: STE-60) | 8.1, N.7 |
| 9 | final state + verify hash per runner | ✅ from chain and API · ✋ profile page (STE-24) | 9.R1–9.R9 · M.4 |

Also green in run 2: the second batch (Q.1–Q.3), bibs 1..9 agreeing across chain, API, roster and
the desk screen (B.1, 4.1, 4.2), the untimed finish as `null` end to end (7.2, 9.R7), and the
negative paths N.1–N.7.

### Findings

| Ticket | Owner | What |
| --- | --- | --- |
| [STE-61](https://linear.app/sterun/issue/STE-61) | James (`sdk/`) | a write that fails **on the ledger** loses its contract error: the SDK throws "could not be simulated: Cannot read properties of undefined (reading 'type')" for a claim the ledger rejected with `#102` |
| [STE-62](https://linear.app/sterun/issue/STE-62) | Ancung (`fe/` scanner) | the losing desk stops its whole queue with "Something went wrong" instead of re-reading the record, flagging it and carrying on |
| [STE-63](https://linear.app/sterun/issue/STE-63) | Ancung (`fe/`) | console refusals other than the allowlist read "Something went wrong. Please try again." |
| STE-32 (existing) | Ancung | no deployed web app or landing: `sterun.xyz` is a parked domain |
| STE-24 (existing) | Ancung | no public profile page |

No contract bug was found, and no contract was deployed or upgraded.

### Remaining, for Axel

Screen footage, scheduling the walkthrough with every owner, the demo video (STE-28), and the
MANUAL REQUIRED steps above once STE-32 is deployed.
