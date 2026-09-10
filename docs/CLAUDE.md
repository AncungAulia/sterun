# `docs/` — documentation (CLAUDE.md)

| File | What it is | Editable? |
| --- | --- | --- |
| `SYSTEM_DESIGN.md` | the authoritative C1–C14 design: architecture, storage model, lifecycle, TOTP, user flows, the 30-day plan | yes, but see below |
| `deployments.md` | deployment **evidence**: contract addresses, stellar.expert links, wasm hashes, dates | append-only |
| `brand.md` | asset, colour and type guidance (C13) — a summary readable without opening code | yes, but see below |
| `social/` | drafts of public content before it goes out, plus its URL afterwards | yes |
| `WEB_APP_IA.md` | information architecture for `fe/`: the page map, the data limits per page, the shape of the event metadata document, the build order | yes, same rules as `SYSTEM_DESIGN.md` |
| `specs/` | the **FROZEN** handoff contract (C4) | has its own rules → [`specs/CLAUDE.md`](specs/CLAUDE.md) |

## `SYSTEM_DESIGN.md`

This is what anyone reads first before starting work, and what Linear ticket descriptions point at.
If an implementation ends up diverging from this document, **do not let it diverge quietly**: update
the document in the same commit, or write down why the divergence is deliberate. A design document
that lies is more dangerous than no document at all.

Things that have moved somewhere stricter — do not duplicate them here:

- function signatures, event layouts, error codes → `specs/INTERFACE.md` (frozen)
- the definitions of `participant_hash` and TOTP → `specs/HASH_AND_TOTP.md` (frozen)
- contract build/test conventions → `sc/CLAUDE.md` and `sc/README.md`

Concrete values in `SYSTEM_DESIGN.md` (for instance "USDC") may lag behind a settled decision
(testnet is **sUSD**); the root `CLAUDE.md` wins on any conflict.

## `brand.md` — a summary, not a source of truth

The real token values live in `landing-page/app/tokens.css` (and its copy in `fe/app/tokens.css`).
`brand.md` copies part of them so that someone who does not open the code can still read them. When
the two disagree, **the tokens win** — `brand.md` is the one that is wrong, and it gets fixed in the
same commit.

The logo assets themselves are not here: `landing-page/public/brand/logo/`, with a copy in `fe/`.

## `social/` — draft first, publish later

Content that represents the project in public is written as a file here, reviewed by Axel (PM), and
only then posted. Once it is live, its URL is recorded back into the same file.

The reasoning matches `deployments.md`: a claim nobody else can check is treated as not having
happened. What is being checked here is the **accuracy of technical claims** — a post mentioning
mainnet, USDC or a release date that does not exist yet costs more than not posting at all.

## `deployments.md` — the evidence rules

Every deploy **must** be committed here. The minimum per entry:

| Column | Why |
| --- | --- |
| date + network | separates testnet from mainnet, and one deploy from a redeploy |
| contract address (`C…`) | its on-chain identity |
| stellar.expert link | so someone else can check without a CLI |
| **sha256 of the wasm that was actually uploaded** | not the hash from a README table — Rust builds are not reproducible across machines, and `sc/README.md` shows the proof |
| ticket | the STE-# that produced it |

Recorded so far, all **live on testnet**:

| What | Address | Ticket |
| --- | --- | --- |
| sUSD SAC | `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` | STE-30 |
| EventRegistry v1 | `CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64` | STE-33 |
| RaceRecord v1 | `CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4` | STE-33 |
| EventRegistry (current, v2) | `CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU` | STE-35, upgraded in place by STE-36 |
| RaceRecord (current, v2) | `CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW` | STE-35 |

**Two pairs, and both are alive.** v1 is non-upgradeable so it cannot be replaced in place; v2 has
paid add-ons, the `Cancelled` status, the organiser allowlist and `upgrade`. `be/` and `fe/` both
run against **v2**.

This file is **parsed by `be/src/deployments.ts`** to resolve those addresses, under the rule that
every row carrying the same label must agree. That is why the **unqualified** label
(`**EventRegistry**` / `**RaceRecord**`) belongs to the pair currently in use, and the older pair is
labelled `**EventRegistry v1**` / `**RaceRecord v1**`. Give two live pairs the same label and
`pnpm test` goes red with a message about conflicting addresses; give the unqualified label to the
wrong pair and the whole backend quietly points at a dead contract, which is worse because nothing
fails. A test asserts the parser does not resolve the v1 pair. If you add a third pair, follow the
same pattern.

The STE-33 entry also carries a full on-chain rehearsal (`enter` → `claim_racepack` →
`record_finish`) with its negative cases. If you need an example of what "enough evidence" looks
like, that is the one. The STE-35 (v2) entry adds a pattern worth copying: numbers the script
**asserts** rather than merely prints — the organiser's balance is read before and after `enter`,
and a wrong difference fails the deploy.

A claim that something "is deployed" without an entry in this file is treated as not having
happened. Grant reviewers verify from here.

> `deployments.md` was born on the STE-30 branch (`ops/26-issue-susd-deploy-sac`). If you are on a
> contract branch that has not pulled it yet, the file genuinely is not in your working tree — that
> is not a typo, and it should not be cherry-picked. It is on `main`.
