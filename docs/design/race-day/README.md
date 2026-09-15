# Race day: QR pass and scanner (STE-18)

The design handoff for the two screens a race day actually runs on: the runner's **QR pass**
(STE-21, `/pass/[tokenId]`) and the volunteer's **scanner** (STE-22, `/scan`). It is written to be
implemented from, without asking a question per screen.

| What | Where |
| --- | --- |
| The screens | [`mockups/index.html`](mockups/index.html), openable in a browser, no build step |
| One PNG per screen | [`exports/`](exports/): `r*` runner, `s*` scanner |
| The whole board as one image | [`exports/board.png`](exports/board.png) |
| The transitions | [`mockups/motion.html`](mockups/motion.html): seven studies, each replayable |
| The rules these screens obey | `docs/specs/HASH_AND_TOTP.md` §4–§5 (FROZEN), `docs/WEB_APP_IA.md` §4 and §5.2 |

The mockups are plain HTML and CSS. Every colour, size, radius and shadow is a token from
`mockups/tokens.css`, which is **generated** from `landing-page/app/tokens.css`. There is not one
invented hex or pixel value in the file. Regenerate after a token change:

```bash
python docs/design/race-day/tools/gen_tokens_css.py     # mockups/tokens.css
node docs/design/race-day/tools/export-mockups.cjs      # exports/*.png
node docs/design/race-day/tools/export-motion.cjs       # exports/motion-*.png
```

The exporter needs `puppeteer-core` and a local Chrome; that is why the PNGs are committed. Reading
the design must never depend on being able to run a tool.

---

## 1. What the design is not allowed to change

These come from the frozen spec. A screen that breaks one of them is wrong, however good it looks.

| Rule | Source | What it means on screen |
| --- | --- | --- |
| The code is **6 characters**, and a leading zero is part of it | `HASH_AND_TOTP.md` §4.4 | Never render or store it as a number. `079663` is six glyphs, and the manual-entry field takes six. |
| A new code every **30 s**, accepted **±1 step** (90 s) | §4.2, §4.5 | The pass shows a countdown; a scan during a rollover still passes, and the pass says so. |
| The QR payload is `{"t":…,"s":…,"c":"…"}` | §5 | The QR carries the token id, the time step and the code. **Never the secret.** |
| The manual fallback is **code + bib**, not code + token id | §5 | The volunteer's second field is the bib, which is the number printed on the runner. |
| The secret lives on the runner's device and in the scanner's roster download | §4.1, `be/OPERATIONS.md` | Both sides compute locally: no network at the desk, for either of them. |
| A claim is `claim_racepack`, and a second one fails with `AlreadyClaimed(102)` | `INTERFACE.md` | "Already claimed" is a normal outcome, not a crash, and it is shown as a fact with a time and a desk. |
| Never a participant's full name | `WEB_APP_IA.md` §2.1 | The roster's `name_fragment` ("Budi S.") is the most that appears anywhere. |

---

## 2. Screen inventory

### Runner: `/pass/[tokenId]` (STE-21)

| Id | State | Shows | Export |
| --- | --- | --- | --- |
| R1 | Valid | Bib, QR, six digits, countdown, `Entered` chip | `exports/r1-pass-valid.png` |
| R2 | About to roll over (last 5 s) | Same, plus the line that a code mid-change still works | `exports/r2-pass-rollover.png` |
| R3 | Offline | Same, plus the offline banner | `exports/r3-pass-offline.png` |
| R4 | Racepack claimed | No QR. A collected panel with the time and desk | `exports/r4-pass-claimed.png` |

### Volunteer: `/scan` (STE-22)

| Id | State | Shows | Export |
| --- | --- | --- | --- |
| S1 | Pick an event | Roster download, its ledger and time | `exports/s1-scan-events.png` |
| S2 | Ready | Camera, event chip, queue count, manual-entry button | `exports/s2-scan-idle.png` |
| S3 | **GREEN** | `HAND OVER`, bib, name fragment and category | `exports/s3-scan-green.png` |
| S4 | **RED** code expired | Cross icon, what to ask for, both ways to retry | `exports/s4-scan-red-expired.png` |
| S5 | **RED** already claimed | Triangle icon, when and which desk. From the roster or this phone's own queue, at scan time | `exports/s5-scan-red-claimed.png` |
| S6 | **RED** not on roster | Question icon, bib, the roster's age | `exports/s6-scan-red-unknown.png` |
| S7 | Manual entry | Six-digit code, bib, the leading-zero note | `exports/s7-scan-manual.png` |
| S8 | Clock sanity | Amber banner with the drift and how to fix it | `exports/s8-scan-clock.png` |
| S9 | Offline queue | Waiting claims, saved on the phone | `exports/s9-scan-queue.png` |
| S10 | Syncing | Progress, and the ledger each claim landed in | `exports/s10-scan-sync.png` |
| S11 | Refused (`/scan/[id]/flagged`) | Claims the chain refused, kept for reconciliation | `exports/s11-scan-flagged.png` |

---

## 3. The two-second verdict

The ticket's acceptance is a volunteer reading the result in under two seconds, outdoors, including
a volunteer who cannot tell green from red. Three rules carry that:

**1. Colour is the last signal, never the first.** Measured from the tokens:

| Pair | Ratio | Verdict |
| --- | ---: | --- |
| `success-strong` vs `danger-strong` | **1.26:1** | The two verdict grounds are almost the same brightness. Colour alone cannot separate them. |
| ink on `success-strong` | 4.61:1 | Passes AA at any size. **This is why GREEN uses ink text, not white.** |
| paper on `danger-strong` | 4.05:1 | Passes AA for large text; RED text is never below `--text-2xl`. |
| ink on `warning-strong` | 5.39:1 | The clock banner, ink on amber as the tokens require. |
| paper on `warning-strong` | 2.76:1 | **Fails.** Never put paper text on amber. |

So every verdict differs in **three** ways before colour is considered: the **word** (`HAND OVER`,
`CODE EXPIRED`, `ALREADY CLAIMED`, `NOT ON ROSTER`), the **icon shape** (check, cross, triangle,
question mark), and the **ground** (GREEN is flat; every refusal is diagonally striped).

**2. The verdict owns the screen.** The panel is the whole viewport above the action bar, the word
is `--font-hero` at `--text-4xl`, and the bib under it is `--text-bib`. Reading order on GREEN is
word → bib → name, which is the order a volunteer acts in: decide, match the bib, greet the runner.

**3. A refusal always offers the next move.** S4 puts "Scan again" and "Type the code instead" on
the same screen, because an expired code is recoverable in one second. S5 and S6 offer only "Next
runner", because rescanning cannot change the answer.

---

## 4. Components, in token terms

| Element | Spec |
| --- | --- |
| Bib on the pass | `--text-bib` (72px), weight 600, tabular figures |
| Six-digit code | `--text-3xl`, weight 600, letter-spacing `.22em`, tabular figures |
| QR | 268px square, quiet zone included in the SVG, on `--color-paper` |
| Countdown | 6px track, `--color-n-200` under `--color-teal`, with the seconds beside it |
| Verdict word | `--font-hero` 700, `--text-4xl`, uppercase |
| Verdict icon | 108px circle, inverted: ink on GREEN, paper on RED |
| Buttons | 56px tall, `--radius-md`; the primary is `--color-teal` |
| Manual-entry fields | 68px tall, `--text-3xl`, tabular figures |
| Chips | `--radius-sm`, `--text-xs`; state colours from the status tokens |
| Screen padding | 20px sides, which is the gutter the rest of `fe/` uses |
| Meta row | Label in `--text-xs`, uppercase, `.1em` tracking, over its value in `--text-base`; 24px between items |

**No glyph separators.** Facts are told apart by space and by hierarchy, never by a middle dot, a
slash or a pipe. A row like `10K · Sun 27 Sep · Kupang` reads as one flat string, so finding the
distance means reading the date and the city on the way past; the same three facts as labelled
columns can be scanned for one of them. The rule holds for every list row and status line: two
facts, two positions, 16px apart at least.

Type below `--text-sm` is used only for timestamps and ledger numbers. Nothing a runner reads at a
desk is below `--text-base`.

---

## 5. Behaviour the screens imply

**The pass.** The QR and the code are one thing shown two ways, so they change together on the same
tick. Between 25 s and 30 s into a step, R2's line appears, and it exists because a runner who sees the
code change mid-scan will otherwise start reading the new digits aloud over the volunteer. On claim,
the pass stops producing codes (R4): the only thing a second scan can produce is a refusal.

**The scanner.** Download once (S1), then everything is local: TOTP is recomputed from the roster's
`totp_secret`, and claims go into a queue in IndexedDB. The queue count is visible on every scanner
screen, so "did that send?" never needs asking. When connectivity returns, claims are sent one at a
time and each row keeps the ledger it landed in (S10). A claim the chain refuses moves to Refused
(S11) rather than vanishing.

**What the queue holds is the intent, not a signed transaction.** A queued row is the token id, the
bib and the moment it was scanned. The transaction is built and signed when it is sent, for two
reasons given in section 10: an authorisation signature carries the ledger it expires on, and one
account can only have one transaction in flight at a time. Pre-signing a morning of claims at the
desk would produce a pile that expires and cannot be ordered.

**The clock banner** (S8) appears when the device clock is more than ±90 s from the time the roster
was generated, which is the tolerance the spec gives, so beyond it every scan fails for a reason the
volunteer cannot see. The banner names the drift ("4 minutes fast"), gives the fix, and stays until
a re-check passes.

---

## 6. Motion

Every transition these screens need, at the durations and curves in the token file:
[`mockups/motion.html`](mockups/motion.html), openable in a browser like the board. Seven studies,
each replayable on its own, with a switch that shows what a reviewer with reduced motion turned on
would get. A filmstrip of the verdict arriving is in
[`exports/`](exports/) as `motion-verdict-*.png`, and the whole board as
[`exports/motion-board.png`](exports/motion-board.png).

**The rule all of it follows: movement may make a change legible, it may never delay one.** A
volunteer reading a verdict in the sun is the worst case in this product, so the verdict is readable
before its own animation has finished, and nothing on either screen waits on an animation to become
usable.

### 6.1 The scale

| Token | Value | What it is for |
| --- | --- | --- |
| `--motion-instant` | 90 ms | a value changing in place: the queue count |
| `--motion-fast` | 140 ms | something leaving that has already been read |
| `--motion-base` | 200 ms | the default; anything arriving that has to be read |
| `--motion-slow` | 320 ms | the one decorative case, on the runner's pass only |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | arriving: fast first, settles |
| `--ease-in` | `cubic-bezier(0.55, 0, 1, 0.45)` | leaving |
| `--ease-inout` | `cubic-bezier(0.65, 0, 0.35, 1)` | a value rolling from one state to another |

The tokens live in `landing-page/app/tokens.css` and `fe/app/tokens.css`, identical in both, and
reach the mockups through the same generator as the colours. Nothing in the motion page invents a
duration.

### 6.2 What moves, and how

| # | Moment | Movement | Timing |
| --- | --- | --- | --- |
| M1 | A verdict arrives | the panel rises over the camera; the word and then the bib follow from behind a mask; the icon scales from 0.92 | `--motion-base`, `--ease-out`, the word at 40 ms and the bib at 80 ms |
| M2 | A verdict leaves | down and out, on the volunteer's tap | `--motion-fast`, `--ease-in` |
| M3 | The code rolls over | the six digits roll up one at a time while the QR is swapped on the same tick with no fade | `--motion-base`, `--ease-inout`, 25 ms apart |
| M4 | The manual fallback opens | a sheet from the bottom edge over a scrim that fades with it, covering the camera rather than replacing it | `--motion-base`, `--ease-out` |
| M5 | A banner appears | down from the top edge behind a mask, pushing nothing | `--motion-base`, `--ease-out` |
| M6 | The queue ticks up | one digit rolls in place | `--motion-instant` |
| M7 | The claim lands | the check draws itself, on the runner's pass only | `--motion-slow`, `--ease-out` |

The word leads the bib in M1 by 40 ms, which is the only ordering in the set that matters: it puts
the eye on the instruction before the number. It is worth getting right in code too, because it is
easy to write as a positional rule and get backwards.

### 6.3 What must never animate

1. **The QR itself.** No fade, no scale, no crossfade between one code and the next. A camera
   pointed at a half-drawn code can read it, and reading it wrong is worse than not reading it.
2. **The six-character code's value while a scan is in flight.** The roll in M3 shows that the value
   changed; it does not change what the ±1 step tolerance already allows.
3. **Anything between a scan and its verdict.** No spinner dressing up a decision that is already
   computed locally. The verdict panel is the first thing that moves after a scan.
4. **Position of anything already being read.** The banner in M5 covers dead space rather than
   pushing the layout down under someone's thumb.

### 6.4 Reduced motion

`prefers-reduced-motion: reduce` turns every duration above to zero. Each screen then cuts straight
to the state the animation would have ended on, and no screen loses information: the verdict, the
banner, the sheet and the rolled value are all present without their movement. The motion page has a
switch that forces this, so the check does not need an operating system setting.

One thing the motion page cannot show honestly: the countdown bar on the pass is a value read off the clock, not an animation. The page fakes it with one, so reduced motion empties it there. In the built screen it keeps counting, because turning motion down must not turn information off.

### 6.5 In code

Transform and opacity only, so nothing here can cost a layout pass on a mid-range Android at a
finish line. No animation library is needed for any of it: these are CSS keyframes and transitions.
Whatever runs the camera preview matters far more for frame rate than this does.

## 7. Copy deck

English, short, and addressed to whoever is holding the phone. The volunteer strings are the ones to
translate first if the desk turns out to be Indonesian-speaking only.

| Screen | String |
| --- | --- |
| R1 | `Camera not working? Read these out`, `New code in 19s`, `Works without signal. Keep the screen bright.` |
| R2 | `A code that just changed still works` / `The scanner accepts the step before and after, so being scanned mid-change is fine.` |
| R3 | `Offline. Your pass still works` / `Codes are made on this phone. Nothing is downloaded at the desk.` |
| R4 | `Racepack collected` / `The pass stops making codes once the racepack is collected. Keep it for the race record.` |
| S1 | `Pick the event and download its roster while you still have signal.` / `The download needs signal once. After that the whole desk works offline.` |
| S2 | `Hold the runner's QR inside the frame` / `Type the code instead` |
| S3 | `HAND OVER` / `4 claims waiting to send` / `Next runner` |
| S4 | `CODE EXPIRED` / `The code on the runner's phone changes every 30 seconds. Ask for the one showing now.` |
| S5 | `ALREADY CLAIMED` / `Collected 09:41 at desk 2. Do not hand over a second racepack.` |
| S6 | `NOT ON ROSTER` / `This bib is not in the download for this event. Check the runner is at the right race.` |
| S7 | `Ask the runner to read out the six digits, then their bib.` / `A code starting with 0 is normal. Type all six.` |
| S8 | `This phone's clock is 4 minutes fast` / `Every scan will fail until it is fixed. Settings → Date & time → Set automatically, then come back.` |
| S9 | `4 claims waiting` / `Saved on this phone. They go to the chain by themselves once there is signal.` |
| S10 | `Sending 4 claims` / `A refused claim moves to Refused. Nothing is dropped silently.` |
| S11 | `2 refused` / `Another desk got there first, which is the system working. Only chase it if the runner is still standing in front of you.` |

Words deliberately avoided: **synced** (says nothing about what is on the chain, where the screens give a
ledger and a time instead), **error** and **invalid** on a refusal (the runner is not at fault when a
code expires), and **verified** for a scan (the chain verifies; the scanner checks a code).

---

## 8. Not designed here

- The entry flow and its success screen (STE-21, `WEB_APP_IA.md` §4).
- The organiser console, including the screen that registers a scanner address (STE-17).
- The profile and race record (STE-24).
- The polish pass over every flow (STE-23).
- Anything about how TOTP works: that is frozen in `HASH_AND_TOTP.md` and this design follows it.

## 9. Open, and owned by someone else

1. **Desk identity.** S5 says "desk 2". Nothing on chain carries a desk name; the nearest thing is
   the scanner address that claimed. Either the console names its scanners (STE-17) or the copy
   falls back to the address' first characters.
2. **Sound and haptics.** A distinct pattern per verdict would help more than any visual change in
   direct sunlight. Not specified here because the PWA's capability is Ancung's call.
3. **Indonesian copy.** The strings above are English, per the decision for this ticket. The
   volunteer-facing set is small and worth translating if the pilot desk asks for it.

---

## 10. Checked against the Stellar docs

Run through the Stellar Raven MCP on 15 Sep 2026, because a design that assumes the wrong thing
about the chain fails on race morning rather than in review.

| What the design assumes | Verdict | Source |
| --- | --- | --- |
| Only an allowlisted scanner can claim, and it signs for itself | Holds. `require_auth()` on the address is checked on every call to the function | [Contract authorization](https://developers.stellar.org/docs/build/guides/auth/contract-authorization#require_auth) |
| A claim can be queued offline and sent later | Holds, but only as intent. An authorisation entry carries `signatureExpirationLedger`, the ledger sequence its signature stops being valid on | [Authorization data](https://developers.stellar.org/docs/learn/fundamentals/contract-development/contract-interactions/stellar-transaction#authorization-data) |
| The queue is sent one claim after another (S10) | Holds, and it is not a choice: "Accounts can only perform one transaction at a time" | [Operations and transactions](https://developers.stellar.org/docs/learn/fundamentals/transactions/operations-and-transactions#transactions) |
| A transaction should not sit around unsent | Holds. The docs recommend time or ledger bounds, and treat a transaction not applied within 1 to 2 minutes as one to give up on | [Debugging contract errors](https://developers.stellar.org/docs/learn/fundamentals/contract-development/errors-and-debugging/debugging-errors#3-core-includes-the-transaction-in-the-ledger), [Fees and surge pricing](https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering#surge-pricing) |
| A refused claim is visible after the fact, not before | Holds. A contract error comes back as a failed transaction, with the error in the result meta, so the scanner learns it at submit time | [Debugging contract errors](https://developers.stellar.org/docs/learn/fundamentals/contract-development/errors-and-debugging/debugging-errors#4-core-applies-the-transaction-to-the-ledger) |
| Sending is a submit then a poll, not one answer | Holds. `sendTransaction` answers `PENDING`, and the client polls `getTransaction` until it is no longer `NOT_FOUND` | [Submit a transaction with the JS SDK](https://developers.stellar.org/docs/build/guides/transactions/submit-transaction-wait-js) |
| Ledger time is a usable clock reference | With a caveat worth knowing: close time is a UNIX timestamp whose "accuracy depends on the system clock" of the validators | [Ledgers](https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/ledgers#close-time) |

**What this changed in the design.** "Already claimed" is two different moments, and they are two
different screens:

- **S5, at scan time.** The roster says the record is `RacepackClaimed`, or this phone already has a
  claim queued for it. The volunteer finds out while the runner is still standing there, which is
  the only moment the answer is useful.
- **S11, after the fact.** The chain refused the claim when it was finally sent, because another
  desk got there first. Nobody is in front of the volunteer any more, so the screen is built for
  reconciliation rather than for a decision.

Section 5's rule about queuing intent rather than signed transactions comes from the same pass.
