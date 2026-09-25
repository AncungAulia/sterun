# STE-25 — the mock race rehearsal

A full race, run on **live testnet** against the **live backend**
(`https://api.sterun.xyz`, the same box as `api-sterun.jameshub.fun`) and the v2 contracts in
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

The same directory also holds the **demo seed** (`seed.sh`, STE-68): one run that leaves a demo a
reviewer can click through. It is described [below](#ste-68--the-demo-seed-seedsh).

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
| F (STE-67) | **a forwarded QR screenshot**: R9's QR is captured, the run waits in real time until the roster's `toleranceSteps` has passed, desk-A (offline) scans it → `expired`, no claim queued, R9's record untouched; then R9's **live** pass → GREEN at desk-B. See [the forwarded screenshot](#the-forwarded-screenshot-f1) for what this does and does not prove |
| 5 | desk-A scans R2 twice → local RED; a second on-chain claim → `AlreadyClaimed(102)` |
| 6 | **R4 is scanned at both offline desks**; both sync at the same moment; the chain keeps one, the other desk shows it in Flagged |
| 7 | a results CSV with R6 at 2:10 for 5 km and an unknown bib 999 is held at preview; the corrected file previews clean |
| 8 | 9 results recorded: timed, one **untimed** (R7, STE-41), one DNF (R3), one no-show as DNS (R8) |
| 9 | per runner: chain state, API `/records/:id`, `/runners/:addr/records`, and the `participant_hash` recomputed with the spec's reference implementation from the submitted fields + salt, then `verify` true, and false with one letter changed |
| N | non-allowlisted create (`18`); a non-organiser adding a category, cancelling, raising quota, adding a scanner; enter a Closed race and a Cancelled race (`EventNotOpen(4)`); a non-scanner claim (`104`); a finish before claim (`103`); re-uploading published results (`already_final`) |

### The forwarded screenshot (F.1)

The SOW asks for two fraud attempts caught on camera: a duplicate race pack collection (5.1, 5.2,
6.1) and a forwarded QR screenshot (F.1). F.1 proves exactly this, and the evidence says it in
these words:

> **a screenshot goes stale in under a minute, and even a fresh one can only be used once**

It does **not** prove "a forwarded QR is rejected", because that is not true. The desk accepts
the code's step ±`toleranceSteps` (±1 step of 30 s, read from the roster, which is what the
scanner reads), so a screenshot forwarded and shown **within 30–60 seconds** of being taken
**passes** — longer if the desk's clock runs behind the phone's. That does not help an attacker:
the code turns over every 30 seconds, so a screenshot is worthless within a minute, and a fresh
one is worth what the runner's pass is worth — one claim on one record. Used by someone else, it
spends the runner's claim; the runner is then refused "Already claimed", and two offline desks
handing over two packs is the duplicate-collection case, where the chain keeps one claim and the
other desk flags it.

The wait is real time, never a mocked clock, and the step records how many seconds it took. That
is also how it must be filmed: **take the screenshot, wait on camera, present it, get the
refusal.** Cutting the wait out of the video is the one edit that turns the clip into a lie — it
would show a fresh screenshot being refused, which the product does not do. The run prints the
same note into F.1's observations for whoever holds the camera.

R9 is used because it is the one runner nobody has scanned yet: the desk checks "already
claimed" before the code, so a runner already queued at desk-A would read RED, not EXPIRED.

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

### Cleaning up after itself (STE-68)

A rehearsal organiser is a fresh key that is never saved, so a race the run leaves open can only be
closed by that same process. So:

- **Every race the run creates is tracked, and step `C.1` cancels whatever is not `Completed` or
  `Cancelled`** when the run ends — normally, on an exception, or on Ctrl-C / SIGTERM. Each
  cancellation is a transaction in the evidence; a refusal fails the step.
- **Until `C.1` has run, the evidence header says it has not**, naming the races. A run killed with
  SIGKILL leaves that sentence behind instead of silence.
- **The rehearsal race's `starts_at` is the moment it is created.** The race that ran ends
  `Completed`, which is terminal and cannot be cancelled; dated "three days from now", it sat on the
  directory's default list for three days after every run. The list hides races whose start has
  passed, and nothing on chain or in the backend reads `starts_at`, so the scenario is unchanged.

The sanity races that were at the top of the directory on 2026-09-25 were **not** the rehearsal's:
they come from `sc/scripts/*-testnet.sh` (see [the seed](#ste-68--the-demo-seed-seedsh)).

## How it is built

`src/mock-race.ts` is the stage manager, `src/device.ts` a desk or phone, `src/stale-qr.ts` the
F.1 timing and wording, `src/device-process.ts`
the stage manager's handle on one of those processes, `src/evidence.ts` the writer. Shared with the
demo seed: `src/harness.ts` (accounts, chain and API helpers, the link check), `src/fraud.ts` (F.1
and the "one winner, one flag" check, one implementation for both), `src/faucet.ts` (every faucet
refusal named) and `src/cleanup.ts` (what gets cancelled, and what only gets reported). `run.sh`
bundles them with esbuild into `be/node_modules/.cache/` and `fe/node_modules/.cache/` — inside the package whose dependencies each one imports — so the
rehearsal adds no workspace member, no lockfile change and no file in a teammate's folder.

The writer refuses to write a file containing a Stellar secret seed or any secret value the run
has handled (the admin key, fresh keys, salts, check-in secrets), and `run.sh` greps the run
directory once more at the end.

### Typechecked against `fe/`, in CI

The desks are not a copy of the scanner: `device.ts` imports the web app's own code from
`fe/src/modules/scanner/lib`, `fe/src/lib/totp` and `fe/src/lib/chain`, and `mock-race.ts`
imports `be/src/deployments`. That is the point — the rehearsal tests the code a volunteer's
phone runs — and it means **a change in `fe/` can break the harness without touching it**.

esbuild does not typecheck, so `run.sh` cannot notice. It already happened: STE-62 renamed
`sendClaims`' dependency `claimedAtOf` to `recordOf`, `fe/` was updated, the harness was not, and
the bundle built fine. Run 1 then threw `deps.recordOf is not a function` on every sync and failed
17 steps from 4.3 on, which read like a product bug.

So the harness is typechecked in `.github/workflows/typescript.yml`, which also runs whenever
`docs/rehearsal/**` changes:

```bash
pnpm --filter @sterunxyz/sdk build     # the harness imports the SDK's dist/ types
pnpm --filter fe exec tsc -p ../docs/rehearsal/tsconfig.device.json
pnpm --filter fe exec tsc -p ../docs/rehearsal/tsconfig.stage.json
pnpm --filter be exec tsx --tsconfig ../docs/rehearsal/tsconfig.stage.json --test \
  ../docs/rehearsal/test/device-process.test.ts ../docs/rehearsal/test/stale-qr.test.ts \
  ../docs/rehearsal/test/faucet.test.ts ../docs/rehearsal/test/claims.test.ts \
  ../docs/rehearsal/test/cleanup.test.ts ../docs/rehearsal/test/demo-plan.test.ts \
  ../docs/rehearsal/test/demo-document.test.ts
```

`--tsconfig` is there for `demo-document.test.ts`, which runs the web app's document writer and
reader and so needs their `@/` paths; the stage config maps them.

Both configs extend `fe/tsconfig.json` unchanged — `strict` included — and differ only in where
bare packages resolve, mirroring where `run.sh` puts each bundle: `tsconfig.device.json` (the
desks) from `fe/node_modules`, `tsconfig.stage.json` (the stage manager, the writer and the test)
from `be/node_modules`. Only the packages the harness imports itself are mapped; a new one fails
with `TS2307` until it is added to `paths`. Reintroducing the old `claimedAtOf` fails the check
with `TS2353: … 'claimedAtOf' does not exist in type 'SendDeps'`.

The test pins the other way this tool once lied: a desk or phone process that dies must fail the
step, not leave its calls unsettled so that node exits 0 mid-run with no `EVIDENCE.md` (fixed in
`14ef24a`). It runs real child processes and needs no network. `stale-qr.test.ts` pins F.1's wait
against the pass's own `timeStepOf` and the scanner's `|step − now| ≤ toleranceSteps`, so the
wait can never be shorter than what the desk enforces, and pins the admission that a fresh
screenshot passes.

## STE-68 — the demo seed (`seed.sh`)

The SOW (§3) asks for "a live demo seeded with **at least 3 events and 20 issued records**,
including two deliberate fraud attempts", and a reviewer's first screen is the directory. A
rehearsal leaves 2 races and 9 records, and on 2026-09-25 the directory's top five rows were
sanity races. One seed run fixes both.

```bash
docs/rehearsal/seed.sh                # sweep + seed, 20–25 minutes; evidence in runs/<UTC time>-seed/
docs/rehearsal/seed.sh --sweep-only   # only take the sc/ sanity races off the directory
docs/rehearsal/seed.sh --no-sweep     # seed without the sweep
```

### What one run leaves on testnet

The plan is data, in [`src/demo-plan.ts`](src/demo-plan.ts), and `test/demo-plan.test.ts` holds
it to the SOW's numbers so an edit cannot quietly fall short.

| Race | Where | When | Distances | Records |
| --- | --- | --- | --- | --- |
| Solo Heritage Run 2026 | Stadion Manahan, Surakarta | **last Sunday**, 05:30 WIB — **already run, Completed** | 10K 12 sUSD · 5K 8 sUSD | 12 — times, one DNF, one untimed finish, one no-show; **both fraud attempts** |
| Kota Tua 10K 2026 | Taman Fatahillah, Jakarta Barat | Sunday +3 weeks, 05:00 WIB | 10K 15 · 5K 10 · tumbler add-on 4 | 6 |
| Braga Night Run 2026 | Jalan Braga, Bandung | Saturday before Sunday +7 weeks, 19:00 WIB | 7K 11 · 3K free | 4 |
| Sanur Sunrise Half Marathon 2026 | Pantai Sanur, Denpasar | Sunday +11 weeks, 05:00 **WITA** | HM 20 · 10K 15 | 3 |

**25 records** from 16 runners, eight of whom hold records in two or more races, so their
`/runner/[address]` pages carry more than one. Every race has a poster and an event document
published through `POST /events/files`, written by the console's own `buildEventDocument` in the
race's own time zone. Every description says it is a Stellar testnet demo.

Dates are computed from the moment of the run — never fixed, because a fixed date is right for a
week — and no two races share a timestamp. The Solo race is behind **"Show races that have
finished"** on the directory, because the list hides races that have run; the other three are on
the first screen.

At the Solo race's pack desks (steps `K`, `F`):

| Step | What happens |
| --- | --- |
| K.2 | the main desk hands over nine packs — in **one signature** with `claim_racepack_many` when the live contract exports it **and** the SDK build has `claimRacepackMany`, otherwise one signature each; the evidence says which and why ([`src/claims.ts`](src/claims.ts)) |
| F.1 | **fraud attempt 1**: a forwarded screenshot of R11's pass, shown after the wait, is refused; R11's live pass is accepted. The same step as the rehearsal's F.1, with the same honesty note |
| F.2a, K.4, F.2 | **fraud attempt 2**: R05 collects at both offline desks; both send at the same moment; the chain keeps one claim and the losing desk flags it "Already collected elsewhere" |
| R.1, R.2 | the results file previews clean; all 12 results go in one `record_results` signature; the race is `Completed` |
| V.1 | the links a reviewer opens with no wallet: the directory, each race page, six runner pages, the console |

### Accounts and keys

| Who | Key | Where it lives |
| --- | --- | --- |
| admin | `STERUN_ADMIN_SECRET` | repo-root `.env`; only to allowlist the organiser on the first run |
| demo organiser | `STERUN_DEMO_ORGANISER_SECRET` | **written to `.env` by the first run**, reused after. Import it into a wallet to open the organiser console as it |
| sanity organiser | `stellar keys secret sterun-organiser`, or `STERUN_SANITY_ORGANISER_SECRET` | the stellar CLI; for the sweep only |
| 16 runners, 2 desks | fresh each run | **`.env.demo`** (gitignored, 0600), overwritten each run — a pass can only be shown from its runner's wallet, which the video needs |

No secret is printed or written to the evidence; the writer and `seed.sh` both refuse it.

### Re-running

A re-run **replaces** the demo: step `D.1` cancels the demo organiser's earlier races that are
still open, then publishes a fresh set. A `Completed` Solo race from an earlier run cannot be
cancelled, and is off the default list by its date anyway.

Every run uses **16 faucet payouts** of the faucet's 100 a day (`dailyCapStroops` ÷ the payout).
Preflight checks that 16 fit before anything is created. If the cap is reached mid-run anyway —
someone else used the faucet today — the run stops with `FaucetDailyCapReached` and the time the
cap lifts. Run again after that time; do not loop.

A failed step is reported, never cleaned up automatically: a half-seeded demo is recoverable by
re-running, and a cancellation is not.

### The sweep, and the races it does not touch

`sc/scripts/*-testnet.sh` prove each contract upgrade on the live network by creating a race named
"Sterun … sanity <date>" with a 2027 fixture date, and none cancels it. `sc/` is outside STE-68, so
the next upgrade script will add another; the sweep (`D.0`, first in every seed run) takes it off
again. It is deliberately narrow ([`src/cleanup.ts`](src/cleanup.ts)): it cancels only a race the
sanity key created **and** whose name says "sanity" or "rehearsal", and only if not already
terminal.

Test-named races created by **other** wallets are listed in `D.0` and never attempted — cancelling
would fail as a non-organiser, and that is correct. On 2026-09-25 those were Ancung's `LARI TEKNIK
(TESTING)`, `TechSprint UGM 2026 (TESTING 3)`, `TESTING LARI 4` and `Jogja Run 2026 (Testing)`: hers
to cancel in the console.

### Not run yet

The seed was built while RaceRecord was being upgraded for STE-66, and **has not been run against
testnet**: the demo should be created on the final contract version. What was verified without a
network is the test suite above and a smoke run against a dead API (preflight fails, nothing is
created, `.env` is untouched).

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
