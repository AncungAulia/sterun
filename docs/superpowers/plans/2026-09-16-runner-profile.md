# A runner's public race record — implementation plan (STE-24)

> Executed inline in the session that wrote it. Design:
> `docs/superpowers/specs/2026-09-16-runner-profile-design.md`. Screens: `docs/design/profile/`.

**Goal:** anyone with a link reads a runner's whole race history from the chain, with no wallet, and
(round 2) a runner can prove one record is theirs without their details leaving the browser.

**Global constraints**
- No wallet, no login. Nothing on this page writes.
- A `Finished` record with no time is "No official time", never `0`.
- An RPC failure is never drawn as an empty history.
- The salt never enters the URL, a log or storage; the proof fields clear after a check.
- UI copy from the handoff's deck, English, no dashes, no "NFT" or "token".
- Tests in `__tests__/` beside the code; a thing moves up on its second user.

## Round 1: the page

1. **`lib/record-meaning.ts`** — `meaningOf(record, eventStatus)` and `formatFinishTime(seconds)`.
   Tests: all seven meanings, the null time, hours and sub-hour formats.
2. **`lib/runner-address.ts`** — `isRunnerAddress(text)` with `StrKey`. Tests: valid, wrong checksum,
   a contract `C…` address, lower case, whitespace around a pasted value.
3. **`lib/record-document.ts`** — the card's document through `buildRaceRecordDocument`. Test: every
   fixture state validates.
4. **`hooks/useRunnerProfile.ts`** — records, event summaries per distinct event, and the summary
   numbers (races, finished, first race). **`hooks/useRecordTrail.ts`** — the index's latest
   transition per record, optional.
5. **Components** — `RecordCard`, `RecordChip`, `ProfileHeader`, `ProfileSummary`, `ProfileStates`
   (P9 to P12), `Pagination`. Tests per component, and the page test with the chain mocked: order,
   pagination, the four non-happy screens.
6. **Routes and ways in** — `app/(browse)/runner/[address]/page.tsx`, `app/(browse)/runner/page.tsx`
   (lookup), "My race record" in `WalletButton`, "See your race record" on `EnteredPage`.
7. **Docs** — `fe/CLAUDE.md` section, `WEB_APP_IA.md` row. Lint, typecheck, then screenshots.

## Round 2: proving a record

1. **`lib/participant-hash.ts`** — whitespace table, `normName`, `normId`, `normContact`, preimage,
   SHA-256 through Web Crypto. Tests against every vector in `participant_hash.json`.
2. **`components/ProveRecord.tsx`** — P4 to P8: closed by default, pledge above the fields, the hash
   forming as fields are typed, "Check against the contract" calling `verify`, match and no-match
   copy, fields cleared after, and "Use the receipt saved on this device" where it exists.
3. Full suite with permission, push and PR when told.
