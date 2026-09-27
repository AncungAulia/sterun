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

## Setting up the shoot

### Why not the seeded races

The four demo races on testnet (solo 40, kotatua 41, braga 42, sanur 43) were seeded from another
machine, so their organiser, desk and runner **secrets are in that machine's `.env.demo` and nowhere
else** — the seed refuses to write a secret into anything it commits. Without the organiser key there
is no console for those races and no way to add a scanner desk; without a desk key there is no
`/scan`. The race that already ran (solo 40) is also spent: its packs are claimed and its results are
published, and both are one-shot.

So the loop is filmed on **a race of Ancung's own**, created for the video and dated today. That also
fixes a problem the seeded races have on camera: publishing finish times for a race three weeks in
the future looks wrong, and the date is on screen.

The directory beat still shows all of them. A new open race appears there next to the seeded three,
so beat 1 into beat 2 is one continuous shot with nothing cut.

### The two facts that make it a one-person job

- **`claim_racepack` does not care about the event's status or dates.** It checks two things: the
  caller is the organiser or an allowlisted scanner, and the record is still `Entered`
  (`sc/contracts/race_record/src/lib.rs:510`). Entries do **not** have to be closed first, so the
  race can stay open through the whole shoot.
- **Freighter runs on a phone**, and this app already pairs with it over WalletConnect without the
  kit (`fe/src/lib/wallet/freighter-mobile.ts`) on `stellar:testnet`. That note says the pairing has
  been seen working on a phone. So the pass can live on a real phone, held up to the laptop's webcam,
  which is what race day actually looks like.

### Devices and wallets

| Where | Wallet | Runs |
| --- | --- | --- |
| Laptop, Chrome profile 1 | the already-allowlisted organiser wallet | `/org` — create the race, add the desks, upload results |
| Laptop, Chrome profile 2 | a fresh wallet, added as a scanner | `/scan/<id>` as desk A |
| Laptop, Chrome profile 3 | a fresh wallet, added as a scanner | `/scan/<id>` as desk B |
| Phone, Freighter mobile | 5 runner accounts | enter the race, then `/pass` |

Three Chrome profiles because a desk's queue lives in that profile's IndexedDB — that is what makes
them two separate desks for beat 6, and one Freighter install per profile is the cost of it. Desk B
could reuse desk A's wallet and the footage would be identical, since the desks are told apart by
device rather than by key; two wallets is simply closer to two volunteers with two phones.

### Before the camera is on

1. Render a poster so the race does not look bare: `docs/rehearsal/demo/posters/render.sh`.
2. Create the race from `/org/new`, dated **today**, entry price low (5 sUSD covers it), two
   distances. The wizard asks the wallet 5 times.
3. Add both desk wallets as scanners from the race page.
4. On the phone, for each of **five** runner accounts: connect, press **Get test sUSD** (this funds
   the account from friendbot if it is new, opens the trustline, and pays 50 sUSD — one button), then
   enter the race and pay.

Five runners, not three, because **every beat that matters can only be filmed once per runner**: a
pack is claimed once, and a published result is terminal. Beat 4 spends one runner, beat 5 spends
one, beat 6 spends one. The spare two are what lets a take be re-shot.

The same rule kills the results beat if it is rushed: re-uploading published results comes back
`already_final`. **Film beat 7 last**, and record the finish times only for runners who have already
claimed — a result on an unclaimed record is refused, because `record_finish` requires
`RacepackClaimed`.

The faucet allows one payout per address, so a runner wallet cannot be topped up twice. Five payouts
of the day's hundred.

## The three beats that look hard

### Uploading the results is not one of them

It is one browser, one file, no camera and no phone: open the race, the Results tab, drop the CSV,
read what the review held, fix the file, publish. What makes it feel hard is its **precondition**,
not the screen: a result can only be recorded against a record that is already `RacepackClaimed`, so
it has to come after the race-day beats. And it is one-shot, because re-uploading published results
comes back `already_final`.

Two files to have ready before the camera is on. Replace the bib numbers with the real ones; the
parser accepts `47:12`, `1:02:41` and plain seconds alike, and the header names are generous
(`bib`, `time`, `chip_time`, `result` all work).

The file that gets held — every anomaly here is deliberate, and each is a different kind:

```csv
bib_no,finish_time_s,status
1,47:12,finished
2,52:05,finished
2,58:40,finished
3,,untimed
4,31:18,finished
999,44:51,finished
5,2:10,finished
```

- bib `2` twice with two different times — `duplicate_bib`, severity **wrong**
- bib `999` is in no roster — `unknown_bib`, severity **reverts**
- bib `4` never collected a race pack — `not_claimed`, severity **reverts**
- `2:10` over 10 km — `impossible_time`, severity **wrong**

That is the screen worth filming: four rows held, each with a sentence saying why, **before a single
signature is spent**. The corrected file is the same thing with the four bad rows gone:

```csv
bib_no,finish_time_s,status
1,47:12,finished
2,52:05,finished
3,,untimed
5,49:57,finished
```

### Scanning and the two desks are one setup, not two

Once a single scan works, nothing new is needed for either fraud beat:

| Beat | What changes from the beat before it |
| --- | --- |
| 4, the ordinary claim | the setup itself: a pass on the phone, a desk on the laptop, GREEN |
| 5, the forwarded screenshot | screenshot the pass, **wait on camera**, present it → EXPIRED, then the live pass at the other desk → GREEN |
| 6, the duplicate | profile A scans, **turn the laptop's wifi off**, profile B scans the same pass, wifi back on, both sync |

Beat 6 needs no second network and no second machine. Both desks are offline because the one laptop
is offline, which is exactly the case the desk was built for: the queue lives in each Chrome
profile's own IndexedDB, so the two profiles cannot see each other's claims until they sync. The
webcam is shared because the two scans happen one after the other.

### Enter and pay **on the phone**, not on the laptop

This is the decision that makes the rest work. A pass reaches a runner in the browser they entered
from. Enter on the laptop and the pass is on the laptop, and getting it onto the phone means opening
`/pass/<tokenId>` there and signing again to fetch the secret — which works, and is a step that can
fail on a shoot day. Enter on the phone and the pass is already where beats 4, 5 and 6 need it.

### If Freighter on the phone will not pair

The desk opens on **manual entry** whenever no camera is usable: the volunteer types the bib and the
six digits (`fe/src/modules/scanner/components/ManualEntry.tsx`). It is real product behaviour, built
for a desk whose camera fails.

With it, the whole shoot runs on the laptop alone: a third Chrome profile holds the runner and shows
the pass, and each desk types what it reads. Every mechanism still proves itself on camera — the
duplicate is still refused, the stale screenshot is still refused, the losing desk still flags its
runner. The only thing lost is the shot of a camera reading a QR, and that can be filmed on its own
afterwards with any single runner.

### The order that wastes nothing

A pack is claimed once and a result is terminal, so rehearse on a runner you intend to spend:

1. Enter the race with **all five** runner accounts on the phone.
2. Take runner 5 and walk the whole desk flow with it, camera off. This is the rehearsal, and
   runner 5 is spent on purpose.
3. Only then film beat 4 (runner 1), beat 5 (runner 2), beat 6 (runner 3).
4. Runner 4 stays unclaimed on purpose: it is the `not_claimed` row in the results file.
5. Film the results upload last.

## Recording checklist

- A clean browser profile: no bookmarks bar, no other tabs, no extensions but the wallet.
- A wallet funded from the faucet on camera-safe testnet accounts only.
- Zoom to ~125% so the bib number and the QR read on a phone screen.
- Record at 1080p or better; the CSV preview and the explorer page both have small type.
- If the webcam refuses to read the phone's screen, the desk has a **manual entry** sheet (bib plus
  the six digits) and opens on it whenever no camera is usable
  (`fe/src/modules/scanner/ScanDeskPage.tsx`). It is real product behaviour, not a workaround, so it
  is safe to film. But the SOW asks for a QR being scanned, so at least beat 4 has to be a camera.

## After it is recorded

1. Export both files. Keep the master; the 3:00 cut is what gets attached.
2. Put the link in the **Demo video** row of [`EVIDENCE.md`](EVIDENCE.md) §6.1 D3 and flip the D3
   line in §6.2.
3. Close STE-28 with the link in a comment.
4. `sterun-intro.mp4` has no ticket yet. File one under traction before recording, so it does not
   end up like the intro post in `social/x-intro-post.md`, which was finished, approved, and then
   owned by nobody.
