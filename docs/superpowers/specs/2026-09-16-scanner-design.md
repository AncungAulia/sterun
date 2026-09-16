# The volunteer's scanner (STE-22) — design

**Route:** `/scan`, `/scan/[eventId]`, `/scan/[eventId]/flagged`
**Built from:** `docs/design/race-day/README.md` (STE-18, screens S1 to S11),
`docs/specs/HASH_AND_TOTP.md` §4 and §5 (FROZEN), `docs/WEB_APP_IA.md` §5.2
**Depends on:** STE-16 (`GET /events/:eventId/roster`, live), STE-36 (`is_scanner`, live),
STE-17 (the console screen that allowlists an address, live), STE-21 (the pass it scans, merged)

---

## 1. What this screen has to be true about

A check-in desk is the one place in this product with no network and no patience. Everything below
follows from that, and from the frozen spec the runner's phone already obeys.

| Rule | Where it comes from | What it means here |
| --- | --- | --- |
| A code is six characters, and a leading zero is one of them | `HASH_AND_TOTP.md` §4.4 | Compared as a string, typed into a six-character field, never parsed as a number |
| One step is 30 s, accepted ±1 step | §4.2, §4.5 | A scan during a rollover passes; a screenshot from two minutes ago does not |
| The QR carries `{"t":…,"s":…,"c":"…"}` and never the secret | §5 | The scanner reads three values and recomputes the fourth from the roster |
| The manual fallback is code + **bib** | §5 | The second field is the number printed on the runner, not a token id |
| A second claim reverts with `AlreadyClaimed(102)` | `INTERFACE.md` | "Already claimed" is a fact to show, not a crash to handle |
| Never a full name | `WEB_APP_IA.md` §2.1 | The roster's `name_fragment` is the most that reaches the screen |

And one that is this ticket's own: **a refusal must never be silent**. A claim the chain rejects
moves to a list a person can read, because the alternative is a runner with no race pack and no
record of why.

---

## 2. The four decisions taken for this build

Taken with Ancung on 16 Sep 2026. Each closes an item the STE-18 handoff left to the owner.

**1. The QR is read by `BarcodeDetector` where the browser has it, and by `jsQR` where it does
not.** Chrome on Android decodes in the browser process, which is the fast path and the common desk.
Safari on iOS has no such API, and a desk holding an iPhone that can only type is not a desk. `jsQR`
is plain JavaScript with no WebAssembly file, so there is no second asset for the service worker to
have failed to cache on the morning it matters.

**2. The scanner signs with a connected wallet**, the same Wallets Kit path the rest of `fe` uses.
The alternative — generating a keypair in the browser — puts a funded secret key in IndexedDB on a
borrowed phone, and this repository does not hold secrets. The organiser adds the volunteer's
address through the console's scanners tab, and the chain decides from there: `claim_racepack`
checks `is_scanner`, and the roster route re-reads it on every download.

**3. Two rounds.** Round 1 is everything that happens at the desk: pick an event, download the
roster, read a code, show a verdict, type a code instead, warn about the clock. Round 2 is
everything that happens to a claim afterwards: the queue, sending it, and the refused list. The
split is where the screenshots are useful — round 1 is what a volunteer looks at, and it can be
reviewed on a phone before any of round 2 exists.

**4. A verdict vibrates; it does not beep.** Two short pulses for a refusal, one for a handover.
Audio needs a tap to unlock on a phone and a quiet field is not the case we are designing for. iOS
ignores `navigator.vibrate`, which is acceptable precisely because the design already carries the
verdict in the word, the icon and the ground before colour or sound.

---

## 3. Where the code lives

```
fe/src/lib/totp.ts                    moved up from modules/pass/lib (see below)
fe/src/lib/scanner-store.ts           the roster, the queue and the drift, in IndexedDB

fe/src/modules/scanner/
  ScanEventsPage.tsx                  S1
  ScanDeskPage.tsx                    S2 and the verdict states
  FlaggedPage.tsx                     S11 (round 2)
  lib/
    roster-api.ts                     the authenticated download
    verdict.ts                        the whole decision, as a pure function
    payload.ts                        parsing what a camera read
  hooks/
    useRoster.ts                      download, store, read back
    useCamera.ts                      the stream and its permission
    useDecoder.ts                     BarcodeDetector or jsQR, one interface
    useClockDrift.ts                  S8
  components/
    EventPicker.tsx  RosterCard.tsx  CameraFrame.tsx  VerdictPanel.tsx
    ManualEntry.tsx  ClockBanner.tsx  QueueChip.tsx
```

**`totp.ts` moves up on its first second user**, which is the rule in `fe/guides/ARCHITECTURE.md`
§4.2 and is exactly this commit. The pass generates codes with it and the scanner checks them with
it; two copies would be two implementations of a frozen document, and the one that drifts would
drift on race morning. The move keeps `codeAt`, `timeStepOf`, `secondsLeft` and `qrPayload`
together, and the vector test moves with them.

`modules/scanner/` is a feature, not a second app. `WEB_APP_IA.md` §1 already records why the
scanner is not on its own origin for the MVP, and the condition for reversing that before mainnet.

---

## 4. The verdict, as one pure function

Everything a scan decides is computed with no network, no camera and no React, from three inputs:
what the QR said, what the roster holds, and what this phone has already queued.

```ts
type Verdict =
  | { kind: "green"; entry: RosterEntry }
  | { kind: "expired" }
  | { kind: "claimed"; at: string | null; by: string | null }
  | { kind: "unknown"; bibNo: number | null };

function verdictFor(
  scanned: { tokenId: number; step: number; code: string },
  roster: RosterEntry[],
  queued: Set<number>,
  nowStep: number,
  codeAt: (secretHex: string, step: number) => Promise<string>,
): Promise<Verdict>;
```

In order, because the order is the answer a volunteer needs:

1. **Not on the roster** → `unknown`. Nothing else can be checked without a secret.
2. **Already claimed**, from the roster's snapshot state or from this phone's own queue →
   `claimed`. Checked before the code, because a valid code changes nothing about a pack already
   handed over, and because the runner in front of the volunteer needs the reason, not the maths.
3. **The step is outside ±1 of now** → `expired`. This is the screenshot case, and it is decided on
   the step alone, without computing anything.
4. **The code does not match `codeAt(secret, step)`** → `expired` as well. A volunteer cannot act
   differently on a mistyped code and a stale one, so they read the same screen.
5. Otherwise → `green`.

The state that makes 2 true is the union of two sources with different ages: the roster's snapshot
(the ledger it was taken at) and this device's queue (a second ago). Both are checked, because the
common double-scan is the same desk twice within a minute, which the snapshot cannot see.

A GREEN verdict writes the queue row before the panel renders. A volunteer who hands over a pack and
drops the phone has still recorded the claim.

---

## 5. The roster, and how stale it is allowed to be

`GET /events/:eventId/roster`, signed the way every authenticated route in `fe` is signed: challenge,
sign the nonce, send address + nonce + signature. Returns `event_id`, `snapshot_ledger`,
`generated_at`, the TOTP parameters, and one entry per runner: `token_id`, `bib_no`, `category_id`,
`state`, `name_fragment`, `add_ons`, `totp_secret`.

Stored whole in IndexedDB under its event id. S1 shows the ledger and the time it was taken, because
that is the only honest measure of what a desk is working from, and a re-download is one tap.

**The TOTP parameters come from the response**, not from a constant in this repository. The backend
sends `digits`, `step_seconds` and `tolerance_steps` deliberately, and a scanner that hardcodes them
is a scanner that silently disagrees the day they change. `lib/totp.ts` keeps 30 s as its default and
the verdict takes the tolerance it was given.

**The clock.** At download, the device's clock is compared with `generated_at` and the difference is
stored with the roster. Beyond ±90 s — the tolerance the spec allows, so beyond it every scan fails
for a reason invisible to the volunteer — S8's amber banner appears with the drift in plain words
("4 minutes fast") and the fix. It is re-checked on every fresh download, and it never blocks a
scan: a phone whose clock is wrong can still type a code that another phone's clock agrees with.

---

## 6. The queue and the refused list (round 2)

A queued row is **intent**, not a signed transaction: token id, bib, and the moment it was scanned.
The transaction is built and signed when it is sent. Section 10 of the STE-18 handoff has the
reasoning from the Stellar docs: an authorisation entry carries the ledger its signature expires on,
and one account can only have one transaction in flight at a time. A morning of pre-signed claims
would be a pile that expires and cannot be ordered.

So the queue drains **one row at a time**, in the order it was scanned, through `claimRacepack` on
`SterunClient` with the connected wallet as the actor. Each sent row keeps the ledger it landed in.
A row the chain refuses with `AlreadyClaimed(102)` moves to the refused list rather than being
dropped or retried: another desk won, the outcome is final, and the only thing left is for a person
to see it.

The queue count is on every scanner screen. "Did that send?" is then a question nobody has to ask.

---

## 7. What happens when the desk's phone will not cooperate

| Case | What the volunteer gets |
| --- | --- |
| Camera permission refused | The manual entry screen, opened, with one line saying the camera was not allowed and how to undo it |
| No camera at all | The same, without the line about permission |
| Neither `BarcodeDetector` nor `jsQR` loads | The same. Manual entry is the floor this screen never falls below |
| No wallet connected | S1 asks for it before any download. The roster is refused without a signature anyway |
| The address is not allowlisted | The download's 403 is shown as what it is: this address is not a scanner for this event, ask the organiser |
| The roster has never been downloaded on this phone | `/scan/[eventId]` sends the volunteer back to S1. There is nothing to verify against |

---

## 8. Testing

Every rule above is a test, and the ones that come from the frozen spec are tested against the
frozen vectors rather than against our own output.

- **`verdict.ts`** — the five branches, in order, including the two that make the order matter: a
  valid code on a claimed record is `claimed`, and an unknown token with a perfect code is
  `unknown`. Tolerance at exactly ±1 step and at ±2.
- **`payload.ts`** — the frozen payload parses; a leading-zero code survives as a string; malformed
  JSON, a missing key and a wrong type are refused rather than thrown.
- **`totp.ts`** — the existing vector test, moved with the file and unchanged.
- **`scanner-store.ts`** — round trip through `fake-indexeddb`, one roster per event, the queue's
  order preserved, and a check that no field of a roster entry is a name.
- **The components** — the verdict panel says the word, shows the icon and the bib; the manual form
  takes six characters and a bib and refuses five; the clock banner appears over the drift threshold
  and not under it.
- **Round 2** — a node-environment test that drains a queue of three against a stubbed client, where
  the second one reverts, and asserts the order, the one-at-a-time rule and the refused row.

Camera, airplane mode and a real phone's decoder are verified on the deployed build (STE-32), the
same deferral STE-21's offline check took. `next dev` is not the thing that runs at a desk.

---

## 9. Not in this ticket

- The organiser's reconciliation tools beyond the refused list (the handoff says a list is enough).
- Sound, and Indonesian copy for the volunteer strings (both open in the handoff §9, neither needed
  to run a desk).
- Naming a desk. Nothing on chain carries a desk name, so S5 shows the claiming address' first
  characters until the console names its scanners.
