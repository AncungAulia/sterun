# Screenshots of the deployed app

What the SOW asks for under §6.1 D3, next to the demo video: *screenshots. Dashboard browsing the
event directory and runner profiles.*

Every image here is the **deployed** app at `app.sterun.xyz`, read live from Stellar testnet, taken
by [`shoot.cjs`](shoot.cjs) at a phone width (390) and a laptop width (1440). Nothing is a mockup and
nothing is a local dev server.

```bash
# puppeteer-core is not a dependency of this repository; install it wherever you like
# and point NODE_PATH at it. Chrome itself is found automatically, or passed as the
# first argument.
node docs/shots/shoot.cjs
node docs/shots/shoot.cjs --only=directory,race
node docs/shots/shoot.cjs --app=http://localhost:3001 --landing=http://localhost:3000
```

| Image | What it shows |
| --- | --- |
| `directory-*` | The race board, open to anybody, with no wallet and no login |
| `race-*` | Kota Tua 10K 2026: poster, venue, distances, price, entries left |
| `runner-history-*` | **The page the SOW names**: one address, three races, one of them finished |
| `runner-untimed-*` | A finish with **no official time** — the fun-run outcome (STE-41) |
| `runner-dnf-*` | Did not finish |
| `runner-dns-*` | Did not start: entered, never collected a race pack |
| `runner-lookup-*` | Reading any address |
| `organisers-*` | How an organiser asks for access |
| `landing-*` | `sterun.xyz` |

The runner pages are seeded demo addresses, listed in
[`../rehearsal/runs/2026-09-25T09-08-01Z-seed/EVIDENCE.md`](../rehearsal/runs/2026-09-25T09-08-01Z-seed/EVIDENCE.md).
They were chosen for the four outcomes this product distinguishes and most systems do not.

## What is not here, and why

The **pass**, the **scan desk** (green, red, and the flagged list), the **signed-in console** and the
**results review** all need a wallet key, so a script cannot reach them. They come out of the video
shoot as frames — see [`../video-script.md`](../video-script.md).

This is also why `docs/design/polish/exports/console-*.png` must never be used as a screenshot of the
console: that tool has no wallet, so what it photographed on 15 September was the *Connect the wallet
you want to organise with* screen. And `docs/design/profile/` and `docs/design/race-day/` are the
**designs STE-21, STE-22 and STE-24 were built from**, drawn before the code existed. They are not
pictures of the product.

## Two things the script has to do, both learned the hard way

**Wait for the data, not for the page.** A profile reads its records first and then one summary per
race. While those are in flight a card deliberately falls back to `Race 41` with a category of
`Unknown`, because a race that will not answer should cost its card a name rather than the card
(`fe/src/modules/profile/hooks/useRunnerProfile.ts`). The first run of this script waited on the
heading *Race record*, which is static, and photographed three cards mid-load. Every page now also
carries a pattern that must have **gone** before the shutter opens.

**Freeze what moves.** The header's placeholder rolls through *race*, *venue* and *city* on a CSS
wheel, and a shutter that opens between two words photographs a word sliced in half. The script
removes animations and transitions rather than pausing them, so the wheel returns to rest and the
field reads *Search by race*.
