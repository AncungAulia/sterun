# The QR pass: `/pass/[tokenId]` (STE-21, round 2)

Date: 2026-09-16. Owner: Ancung. Round 1 (entry to bib and receipt) is merged in `main`.

Built from Nabil's handoff, `docs/design/race-day/README.md` (STE-18), and the frozen
`docs/specs/HASH_AND_TOTP.md` §4-§5. What the design does not decide, this document does.

## What it is for

A runner at a pickup desk shows a code, a volunteer scans it, and a race pack changes hands. The
venue has no signal worth relying on, so **the pass must work with the network off**: the code is
computed on the phone from a secret stored there at entry, never fetched at the desk.

## The four states

From the design, `exports/r1..r4`:

| State | What it shows |
| --- | --- |
| Valid | race, distance, date, (city), bib, `Entered` chip, QR, countdown, the six digits |
| About to roll over | the same, plus "A code that just changed still works" in the last 5 seconds |
| Offline | the same, plus "Offline. Your pass still works" as reassurance, not an error |
| Race pack claimed | no QR and no code, a green collected panel, and the way to the race record |

## Where each fact comes from

| Fact | Online | Offline |
| --- | --- | --- |
| the six digits and the QR | computed on the phone from `totp_secret` | identical: no network is involved either way |
| bib, race name, distance, date | the chain (bib) and this device's stored entry | the stored entry |
| state (`Entered` / `RacepackClaimed`) and the claim time | the chain, cached into the stored entry after each read | the last state this device saw |
| the city | the race's document, cached into the stored entry once read | shown only if it was cached; the row is absent otherwise |

Round 1 stored no city, so that row appears after the first online visit. Distance and date are
stored already, so the pass is never blank.

## Rules the code has to obey (frozen, not ours to choose)

- `time_step = floor(unix_seconds / 30)`; `HMAC-SHA-256(secret, 8 big-endian bytes)`; RFC 4226
  dynamic truncation; **6 characters, left-padded with `0`**, never a number.
- The QR payload is exactly `{"t":<token>,"s":<step>,"c":"<code>"}`, no spaces, `c` a string.
- The secret never leaves the device and never enters the QR.
- A scan mid-rollover is fine: the scanner accepts the step before and after.

Tested against `docs/specs/vectors/totp.json`, including `tp-02-leading-zero`, rather than against
our own output.

## Getting the secret onto this phone

1. **The device that entered** already has it: round 1 wrote `totp_secret`, `salt`, bib name and the
   race's facts into IndexedDB.
2. **Any other device** (entered on a laptop, changed phone, cleared data) connects the wallet that
   owns the record, signs one message, and `GET /records/:tokenId/pass` returns the secret (STE-52,
   live). It is then stored on that phone, and the desk needs no network afterwards.

A wallet that does not own the record gets 403; the page says to connect the wallet that entered.

## Offline and installable

- A **hand-written service worker**, registered from the pass only, **scoped to `/pass`**. The
  directory, the race pages and the console stay network-only, which is what keeps "the chain is
  the source of truth" honest (`docs/WEB_APP_IA.md` §1).
- `app/manifest.ts` so the pass can be installed to a home screen.
- The honest limit, said on screen rather than hidden: **the first visit needs signal once.** After
  that a reload at the venue works.
- The offline banner reads the browser's `online`/`offline` events. Not Next's experimental
  `useOffline`, which retries server requests and needs a config flag; this page makes no server
  requests once it has the secret.

## Motion

Only what the handoff specifies, from the motion tokens already in `app/tokens.css`: the six digits
roll one at a time on the step boundary (`--motion-base`, `--ease-inout`, 25 ms apart), and the
check on the claimed panel draws itself (`--motion-slow`). **The QR never animates** - a camera
reading a half-drawn code is worse than one that reads nothing. `prefers-reduced-motion` drops every
duration to zero, except the countdown, which is a value read off the clock rather than an
animation.

## Also in this round

- **Open my pass** on the race page stops being disabled and goes to `/pass/[tokenId]`.
- The success page's way on points at the pass.

## Not in this round

- The scanner (STE-22) and anything it needs.
- The public race record at `/runner/[address]` (STE-24). The claimed panel's "View race record"
  goes to the success page, which is the record this app has today.
- A desk name on the claimed panel. The chain carries the claim time and the scanner's address, not
  a name; the panel shows the time alone rather than inventing one (Nabil's open question, §9).
- Push notifications, sound and haptics.

## How it is verified

- The TOTP unit against the frozen vectors, and the QR payload byte for byte.
- Each of the four states, with fake timers around a step boundary.
- The secret re-fetch: owner gets it, another wallet is refused, an unconfirmed entry says so.
- Service worker registration is mocked in tests; the real offline check is a phone in airplane
  mode, which is Ancung's to do in a browser.
