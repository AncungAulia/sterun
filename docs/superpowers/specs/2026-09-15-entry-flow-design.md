# Entry flow — design (round 1 of STE-21)

**Date:** 2026-09-15 · **Owner:** Ancung (`fe/`) · **Ticket:** STE-21 · **Depends on:** STE-47 (done,
live)

## What this is

A runner goes from **Enter 10K** on a race page to a paid, on-chain entry and a receipt they keep.

STE-21 is split into two rounds, each with its own spec, plan and PR:

| Round | Scope |
| --- | --- |
| **1 (this document)** | `/events/[id]/enter` → the three steps → Sign and pay → the success page and receipt |
| 2 | `/pass/[tokenId]`: the rotating QR, installable, offline; moving a pass to a phone |

`/profile` moves to STE-24. Round 1 ships on its own: after it, a runner can enter and pay on
testnet.

## Decisions (taken with Ancung, 2026-09-15; not to be reopened here)

1. **One person, one entry per race.** Indonesian races allow one category per participant per race
   day (Panglima TNI Run rules; Pocari Sweat Run and Surabaya Isoplus Marathon allow a second
   category only on a different day; BFI Run allows one registration per email). A Sterun race has
   one start date, so every distance runs the same day. Enforced in two layers:
   - **frontend:** one wallet, one entry per race;
   - **backend (ticket):** refuse a second entry with the same identity document number in the same
     race, from any wallet.

   Consequence accepted: one wallet cannot enter family members.
2. **Three steps**, then a separate success page.
3. **One Sign and pay button, two wallet approvals behind it**, shown in a progress dialog.
4. **Submit first, then pay** ("option A"). The alternative, paying first and sending details after,
   was rejected: a runner who closes the tab after paying would have paid with no details in the
   vault, and no way to check in on race day.
5. **A downloadable receipt**, gated by "I've saved my receipt".
6. **Test sUSD from the app**, in the site header's wallet menu and inline at the pay step.
7. **Entering on a laptop, running with a phone**: handled in round 2 (the owner re-fetches the pass
   with the same wallet; a transfer QR as a fallback). Round 1 only stores what round 2 reads.

## Facts this design rests on (checked in code, not assumed)

- `RaceRecord.enter` checks that the race is `Open`, the distance has places, and the add-on ids are
  valid. **It does not stop one wallet entering the same race twice**, and each entry charges again.
- `enter` is atomic: the place, every add-on unit, the payment and the mint land together or not at
  all. **If no record exists, nothing was charged.**
- `POST /participants` requires a wallet signature and **inserts a new vault row on every call**,
  with a fresh salt, hash and TOTP secret. There is no deduplication.
- `POST /participants/:id/confirm` is idempotent for the same token id.
- sUSD is a classic asset. A paid entry needs a trustline and a balance; a free entry needs neither.
  The backend faucet today is CLI-only (`pnpm faucet`).
- Add-ons in the event document join the chain by `code`; a sized item is one on-chain add-on per
  size (`EVENT_JERSEY_M`). `TabAddOns` already performs this join.
- Bib numbers are `entered_count` **per distance, from 0**. The scanner and the results upload use
  the same number.

## The flow

### Before the form

`/events/[id]/enter?category=<id>`. The page resolves, in order:

| Condition | Shows |
| --- | --- |
| no wallet connected | the connect prompt |
| race not `Open` | "Entries for this race are closed." and a link back to the race |
| **this wallet already has a record in this race** | "You're already entered", the distance and bib, a link to the race page (to the pass in round 2) |
| the chosen distance is full | "This distance is sold out." and the other distances |
| otherwise | step 1 |

The already-entered check reads the wallet's records on chain (`recordsOfDetailed`), not the index,
because it decides whether somebody pays twice.

### Step 1 — Distance & race pack

- The distance, preselected from `?category=`, changeable among distances with places left.
- The add-ons offered to that distance (`includedIn` in the document), each with its price from
  chain. Sized items show their sizes; a size with no units left cannot be picked. Items included
  with the ticket show as included and still record the choice (their on-chain unit is reserved).
- A running total.

### Step 2 — Your details

Fields (all required, matching STE-47's schema): full name; identity document type
(`national_id_card` / `passport` / `driving_licence` / `other`); identity document number; name on
bib (1 to 16 characters); email; phone; gender (`female` / `male`); date of birth; emergency contact
name; emergency contact phone.

- **Both phones use a country-code picker and always produce E.164** (`+628123456789`). The
  emergency phone is hashed, and `norm_contact` never adds a country code, so this is correctness,
  not polish. The default country is the one the visitor chose in the directory, else Indonesia.
- Date of birth is a date picker, never an age.
- Errors appear at Continue for empty fields and immediately for impossible values, the same split as
  the wizard (`missing.ts`).

### Step 3 — Review & pay

A summary of steps 1 and 2 with edit links, the total, **`NonRefundableNotice` directly above the
button**, and **Sign and pay**.

**Refresh does not keep personal details.** A laptop can be shared, and an identity number must not
be left in browser storage. The distance and add-on choices may be kept.

## Sign and pay

A dialog that cannot be dismissed while it runs, reading "Your wallet will ask you twice":

1. **Confirm it's you** — sign the backend challenge (SEP-53 message, free), `POST /participants`.
   The response (`participant_id`, `participant_hash`, `salt`, `totp_secret`) is kept in memory for
   the rest of the attempt.
2. **Pay and enter** — sign `enter(event_id, category_id, addon_ids, participant_hash)`.
3. On success: `POST /participants/:id/confirm` with the token id and transaction hash, write the
   entry to IndexedDB (below), go to the success page. A failed confirm is retried in the background
   and does not block the runner, because the entry already exists on chain.

### When it fails

| What happened | Shown | The button does |
| --- | --- | --- |
| declined a signature | "Nothing was charged." | **Try again**: repeats the declined step without re-sending details |
| sUSD short or no trustline | "You need X sUSD to enter." + Get test sUSD | **Try again** once the balance is enough |
| distance sold out meanwhile | "This distance just sold out." | back to step 1 |
| race closed meanwhile | "Entries for this race have closed." | back to the race page |
| no answer (timeout, dropped connection) | see below | — |

**No answer.** The runner is never told "this may have gone through". The dialog checks on its own:

1. "Checking whether your entry went through…" — look for a record of this wallet in this race,
   repeatedly for about 30 seconds.
2. Found → the success page.
3. Not found → **"Your entry didn't go through"** / "Nothing was charged. Your details are still
   here, so you can try again." / **Try again**. True because `enter` is atomic.
4. The check itself fails → **"We couldn't check your entry"** / "Your internet connection dropped.
   Before paying again, reconnect and tap Check again, so you are not charged twice." /
   **Check again**.

A retry re-uses the step-1 response and the same `participant_hash`. Details are re-submitted only if
the runner edits them; the earlier vault row is then left for the backend's clean-up.

All messages go through `friendlyError`. Classifying `QuotaFull` / `EventNotOpen` / `AddOnQuotaFull`
from `enter` needs telling our contracts' errors apart from the sUSD token's, which shares the
`1..=99` band (`fe/CLAUDE.md`, errors); the plan must settle how before those sentences are added.

## The success page

`/events/[id]/entered/[tokenId]`, a page of its own. Race, date, distance and bib number are read
from chain, so a refresh still shows them anywhere. **The name on the bib and the receipt code come
from IndexedDB** (neither is on chain, and the vault returns neither), so they are shown only in the
browser that entered; elsewhere the page shows the rest and says the receipt is on the device that
entered.

1. "You're in!" with the race, date and distance.
2. The bib number, large, and the name on the bib.
3. The receipt box: "Keep this receipt. Together with your ID details, it proves this race record is
   yours." The code, partly masked with a reveal; **Download receipt**; **Copy code**.
4. "I've saved my receipt", which enables the way on (the race page in round 1, the pass in round 2).

**The receipt file** carries: race name, date, distance, bib number and bib name, record number (token
id), wallet address, participant hash, the receipt code (salt), the stellar.expert transaction link,
and the entry date. **It carries no name, identity number, email or phone**, so a leaked receipt
leaks no personal data. Its format and look are settled in the mockup.

**Bib numbers are shown as the contract holds them** ("10K · Bib 0") until Axel decides otherwise;
see open questions.

## What is stored on the device

IndexedDB, one entry per token id: `event_id`, `category_id`, `token_id`, `bib_no`, `bib_name`, race
name and start, `participant_hash`, `salt`, `totp_secret`, `entered_at`. Round 2's pass reads this
without a network. Nothing else is persisted; losing the device is recovered in round 2 by re-fetching
the secret with the owning wallet.

## Test sUSD

One component, **Get test sUSD**, in two places: the site header's wallet menu, and the pay step
when the balance or trustline is missing.

1. No trustline → the wallet signs one `changeTrust` for sUSD.
2. The backend faucet sends a fixed amount, limited per wallet (for example once per 24 hours).
3. The new balance is shown.

**Testnet only**: the component does not render on any other network.

## Backend and product work this needs

Tickets to file with this spec:

| # | Owner | What |
| --- | --- | --- |
| 1 | James | a faucet route for Get test sUSD (testnet only, rate-limited per address) |
| 2 | James | delete vault rows never confirmed after 24 hours |
| 3 | James | refuse a second entry with the same identity document number in the same race |
| 4 | James | return a record's `totp_secret` to the wallet that owns it (used in round 2) |
| 5 | Axel | how bib numbers are shown, given they start at 0 per distance |

## Testing

- **Pure functions**: form validation (E.164, date of birth bounds, bib name length), add-on
  selection against stock, the receipt's contents, and the Sign and pay state machine including every
  failure row and the no-answer check.
- **Components**: each step, the already-entered and sold-out gates, each failure state, the success
  page with and without a stored receipt, the receipt gate.
- **Live testnet**: a free race and a paid race, end to end, to the success page; then a browser
  check at 1440 by 900 and 390 by 844.

## Not in round 1

`/pass`, moving a pass to a phone, `/profile`, emailing the receipt, health data (STE-48), insurance,
automatic entry close at the registration date (STE-45/46).

## Open questions

1. **Bib display** (Axel): numbers start at 0 per distance, and the same number is used by the
   scanner and the results upload.
2. **Receipt format** (Ancung, in the mockup): PDF or another format, and its look.
