# The first introduction post — the Sterun X account

Ticket: **STE-7**. Owner: Nabil. Reviewer before it goes out: **Axel (PM)**.

Account handle: **[@sterunxyz](https://x.com/sterunxyz)**

Status: **copy approved by Axel, posting deferred.**

Axel decided this post should only go out **once the web app is deployed and has a domain**, so
that the account's first post has something people can click. STE-7 was therefore closed without a
published post even though its requirements list said otherwise — a PM decision changed that
condition; it was not an oversight.

The trigger: **[STE-32](https://linear.app/sterun/issue/STE-32)** (deploy the web app and landing
page to Vercel, owner Ancung, target 2026-10-01). As soon as that URL is live, post the copy below
and then fill in [After it goes out](#after-it-goes-out).

A warning to whoever reads this later: STE-7 is already Done, so **no ticket owns this work any
more.** If STE-32 slips, this post slips with it and nothing will raise a flag.

---

## The final copy

```
You ran a 10k in 2019. Prove it. The results page is gone and your certificate
is a jpeg in a folder somewhere.

Sterun makes every entry a race record on Stellar, so it outlives the organiser
and can't be resold.

Live on Stellar testnet.
```

**239 characters.** The account has no X Premium, so the limit is 280 and this copy has to fit as a
single post — not a thread. If it is ever edited, count again.

**Why this version.** Its hook is loss rather than danger: "Prove it." makes the reader think about
their own race before they realise this is about a blockchain. An earlier version opened with a
runner going down at kilometre 8 and a resold bib — a stronger argument, but too dark a tone for an
account's first post.

What this version still carries: the record's durability (`outlives the organiser`) and the
resistance to resale (`can't be resold`), plus one claim other people can check
(`live on Stellar testnet`).

### Visual

The X banner already in place, or `sterun-lockup-black.svg` exported to PNG on a `paper` background
(`#F8F8F8`). The usage rules are in [`docs/brand.md`](../brand.md).

Once it is out, **pin the post** — this account is reached by links from the landing page and from
the grant report, and the first post those visitors see should be the one that explains the product.

---

## Verifying the claims

### Internal sources

| Claim | Source |
| --- | --- |
| The contracts are live on **Stellar testnet** | [`docs/deployments.md`](../deployments.md), STE-33 |
| Race records are **non-transferable** | the wasm export surface — no `transfer`/`approve`/`burn` ([`sc/contracts/race_record/CLAUDE.md`](../../sc/contracts/race_record/CLAUDE.md)) |

### MCP Stellar Raven — 2026-09-03

Four things checked before this copy was approved:

**1. "participation record" really is someone else's territory, and more deeply than just the
wording.** Stellar Passport is in the ecosystem directory (slug `stellar-passport`). Its
description: *"…transforms event attendance and community activity… With a single QR scan at a
booth, workshop, meetup, or online event… curated challenges, workshops, or learning tracks that
**verify their participation** and track their progress."*

So they hold the phrase "verify participation" **and** the scan-a-QR-at-an-event mechanic at once.
The consequence is not merely avoiding their term: **Sterun's copy must not open with "scan a QR at
an event"**, because that is their opening line. Our differentiator is a record that sticks to the
runner and cannot be resold.

**2. "race record" is clear.** Zero hits across the whole corpus of official Stellar documentation
(Raven flags a zero on that index as a trustworthy negative). Semantic searches across ecosystem
articles, tweets and research found no other use either. The limit of that claim: *not found in
these sources*, not *does not exist anywhere*.

**3. There is no running or racing project in the Stellar ecosystem.** The closest: `stride`
(fitness tracking + a reward token) and `fewticket` (ticketing + event access control). Sterun's
niche is empty — use this for positioning in STE-27, but do not claim to be "the first in the
world".

**4. "Non-transferable" is the right vocabulary.** SEP-41 defines `transfer` as a **required**
function of the token interface, and OpenZeppelin Stellar ships a Non-Fungible Token module with its
extensions. It is precisely because transfer is the expected default that saying "non-transferable"
means something rather than being an empty claim.

---

## The limits of what may be claimed (applies to all public content)

What must **not** be mentioned until it genuinely exists:

- **Mainnet.** It does not exist yet.
- **USDC.** Testnet uses sUSD; USDC only becomes relevant on mainnet.
- Release dates, user counts, or the name of a partner event that has not given permission.
- **"participation record"** — always **"race record"**. See finding 1 above.

---

## The options not taken

Kept so the reasoning is not lost, and so STE-27 does not repeat this work.

**The medical angle** (265 chars) — the strongest argument, the darkest tone:

```
Someone goes down at kilometre 8 and the medics pull up the wrong blood type,
because that bib was resold two weeks ago.

Sterun makes every entry a race record on Stellar. The contract has no transfer
function, so the bib can't be resold.

Live on Stellar testnet.
```

**The resale angle, neutral** (280 chars) — rejected because the line *"that matters long before the
data does"* dangles: it promises that something is at stake without saying what, and a reader
mid-scroll does not solve riddles.

An Indonesian-language version was also written and then abandoned. This account's readers are
Instawards reviewers and the global Stellar ecosystem; Indonesian fits better when approaching local
race organisers, and that is a different conversation.

---

## After it goes out

| To record | Value |
| --- | --- |
| Post URL | _(fill in)_ |
| Date posted | _(fill in)_ |
| Pinned | _(yes/no)_ |
| Changed from the draft? | _(if yes, write the final copy and recount its characters)_ |
