# The Sterun videos — script and shot list

Two videos, **one recording session, two exports**:

| Export | Length | Camera | Purpose |
| --- | --- | --- | --- |
| `sterun-demo.mp4` | **3:00 or less** | screen only | the SOW §6.1 D3 artifact ([STE-28](https://linear.app/sterun/issue/STE-28), Nabil) |
| `sterun-intro.mp4` | ~4:10 | Aulia on camera, then the screen | outreach: the Stellar Indonesia chapter, `@sterunxyz`, design-partner conversations (STE-26, STE-65) |

`sterun-intro.mp4` is Part 1 with Part 2 appended. Nothing is filmed twice.

**Why they are not one file.** The SOW caps the demo at three minutes and already names its
contents: create the event, enter and pay, scan the QR, claim the pack, publish results, and both
fraud attempts refused. Putting a seventy-second introduction in front of that means cutting a beat,
and the beat that gets cut is always a fraud attempt — the part a reviewer came for.

---

## The limits on every word spoken here

These are not style notes. Each one is a claim that would be false, and the video is the artifact a
grant reviewer checks first. The full reasoning is in
[`social/x-intro-post.md`](social/x-intro-post.md) §"The limits of what may be claimed".

- **Never say mainnet.** It does not exist. Say *Stellar testnet*, out loud, once, early.
- **Never say USDC.** Testnet entries are paid in **sUSD**, an asset we issue ourselves.
- **"Race record", never "participation record".** The second phrase belongs to Stellar Passport.
- **Do not open the demo with "scan a QR at an event".** That is Stellar Passport's opening line.
  Our difference is a record that sticks to the runner and cannot be resold.
- **No real race, no real organiser, no partner name.** Every race on screen is one we seeded
  ourselves (`rehearsal/seed.sh`). If a viewer asks "whose race is that", the honest answer is ours.
- **No refunds, no escrow, no money held.** Sterun never holds anybody's money. Saying otherwise
  invents a product feature that was deliberately not built.
- **No user counts, no launch date, and not "the first in the world".** There is no running project
  in the Stellar ecosystem directory, which is a *gap*, not a record.

One more, for `sterun-intro.mp4` specifically: **it may end up public, so no secret key may appear
on screen.** Not in a terminal, not in an editor, not in a `.env` reflected in a browser devtools
panel. The SDK run recorded for D2 was allowed to show one because it goes to the Stellar reviewers
only; this one is not covered by that.

---

## Part 1 — the introduction (0:00 to 1:12)

English, to camera. ~175 words, which lands near 70 seconds at an unhurried pace. Read it slightly
slower than feels natural; every founder video is recorded too fast.

### 0:00 — who (10s)

> Hi, I'm Aulia. My team and I built Sterun. There are four of us, in Yogyakarta, Indonesia.

### 0:10 — the problem (24s)

Say this part to the camera, not to the notes. It is the only reason anybody keeps watching.

> Here is something almost every runner has. You ran a 10K a few years ago. Your finisher
> certificate is a jpeg in a folder somewhere, the results page is gone, and the organiser who
> published it doesn't exist any more. There is nowhere you can point and say: that was me, I was
> there.
>
> And on the other side of that same race, the only proof of who already collected a race pack is a
> volunteer's memory and a printed list.

### 0:34 — what Sterun is (16s)

> Sterun turns every entry into a race record on Stellar. It belongs to the runner, it outlives the
> organiser, and the contract has no transfer function at all, so a bib cannot be resold.

### 0:50 — why Stellar (22s)

Three reasons, all of them things we hit while building rather than things we read.

> Why Stellar. Fees first: a network fee here is a fraction of a cent, so paying on chain doesn't
> eat a race entry that costs a few dollars. Then speed, around five seconds to final, which is what
> a queue at a race pack desk can actually live with. And Soroban let us upgrade our contracts in
> place four times over, without the address ever changing, so nothing already recorded was lost.

### 1:06 — hand over to the demo (6s)

> Everything after this runs on Stellar testnet. Here is the whole loop, start to finish.

---

## Part 2 — the demo (3:00, hard cap)

Screen only. Voiceover, or captions if narrating over the footage is a fight. Eight beats; the
timings are a budget, and the two fraud beats are the ones to protect if it runs long.

| In | For | On screen | Voiceover |
| --- | --- | --- | --- |
| 0:00 | 18s | The directory at `app.sterun.xyz`, then open **Kota Tua 10K 2026** | "Three races are open. This is what a runner sees: distances, prices, what is left." |
| 0:18 | 30s | Pick the 10K, add the finisher tumbler, the non-refundable line, wallet prompt, receipt | "One distance, one add-on. The entry and the tumbler are one payment, in one transaction, and nothing can be sold to them separately afterwards." |
| 0:48 | 15s | The pass: bib number, name, QR, the code visibly turning over | "The pass is the runner's. The code changes every thirty seconds." |
| 1:03 | 22s | Desk scans the live pass, GREEN, record moves to race pack collected | "At the desk, a scan is a claim on the chain. One entry, one race pack." |
| 1:25 | **35s** | **Fraud 1, the forwarded screenshot.** Take the screenshot on camera, *wait with the clock visible*, present it at the desk → EXPIRED. Then the runner's live pass at the other desk → GREEN. | "Here is the same pass as a screenshot, sent to somebody else. We wait. A screenshot goes stale in under a minute, and even a fresh one can only be used once." |
| 2:00 | 25s | **Fraud 2, the duplicate.** One pass at two offline desks, both hand a pack over, both sync at once. One claim stands; the losing desk shows the runner in **Flagged**. | "Two desks, both offline, both fooled. When they sync, the chain keeps one claim and the other desk is told which runner to go find." |
| 2:25 | 20s | Upload the results CSV. The preview **holds** a 2:10 five-kilometre time and an unknown bib. Fix the file, publish. | "Results are reviewed before a single signature is spent, because a published finish time can never be corrected." |
| 2:45 | 15s | The runner's profile: a finish with a time, a finish with no time, and the record open on stellar.expert | "And this is what the runner keeps. Anyone can check it, including years from now." |

### The one edit that would make this a lie

In beat 5, **the wait stays in the cut.** A forwarded QR is *not* rejected: the desk accepts the
code's step plus or minus one, read from the roster, so a screenshot shown within thirty to sixty
seconds of being taken **passes**. What protects the race is that the code turns over every thirty
seconds and a claim can only be spent once. Cutting the wait would show a fresh screenshot being
refused, which the product does not do. Full reasoning:
[`rehearsal/README.md` §"The forwarded screenshot (F.1)"](rehearsal/README.md#the-forwarded-screenshot-f1).

Say "goes stale", never "is rejected". The caption on screen must match the voiceover.

### What beat 6 needs that the others do not

Two phones, two people and a camera. It is `M.3` in every rehearsal run's evidence and it has never
been automated, because the point is precisely that two humans at two desks cannot see each other.

---

## Recording checklist

- A clean browser profile: no bookmarks bar, no other tabs, no extensions but the wallet.
- A wallet funded from the faucet on camera-safe testnet accounts only.
- Zoom to ~125% so the bib number and the QR read on a phone screen.
- Record at 1080p or better; the CSV preview and the explorer page both have small type.
- The races are already seeded on testnet. Do not create a new one for the video — a fresh race has
  no history behind it, and Solo Heritage Run already carries finished results.

## After it is recorded

1. Export both files. Keep the master; the 3:00 cut is what gets attached.
2. Put the link in the **Demo video** row of [`EVIDENCE.md`](EVIDENCE.md) §6.1 D3 and flip the D3
   line in §6.2.
3. Close STE-28 with the link in a comment.
4. `sterun-intro.mp4` has no ticket yet. File one under traction before recording, so it does not
   end up like the intro post in `social/x-intro-post.md`, which was finished, approved, and then
   owned by nobody.
