-- STE-42 — the index carries what each entry bought (RecordData.addon_ids).
--
-- The organiser console's Entries tab has an Add-ons column and a "to hand
-- out" card. The fact is on chain since v2 (STE-35): `enter` stores the add-on
-- ids a runner paid for in RecordData, in reservation order. The index read
-- that struct on every entry and threw the field away.
--
-- ## Why an array column, not a join table
--
-- The ids are an attribute of one record, written once at `enter` and never
-- changed — no function edits a record's add-ons. A join table would model a
-- relationship that can grow and shrink, and it cannot. The order is part of
-- the fact too (the contract preserves it), which an array keeps for free.
--
-- ## Why NOT NULL DEFAULT '{}'
--
-- "Bought nothing" is `[]` on chain, and the API promises `[]`, never `null`.
-- The default also backfills existing rows with `[]` — which is WRONG for any
-- v2 entry that did buy add-ons. So this migration must be followed by
-- `pnpm indexer rebuild` on a box that already holds records; OPERATIONS.md
-- says so. A backfill here would mean calling the chain from SQL.
ALTER TABLE records
    ADD COLUMN addon_ids integer[] NOT NULL DEFAULT '{}'
    -- u32 on chain; negative is impossible, so a negative is a bug.
    CHECK (0 <= ALL (addon_ids));

COMMENT ON COLUMN records.addon_ids IS
    'RecordData.addon_ids: the add-on ids this entry paid for, in reservation order. '
    'Empty when none. Choices such as a size live in participants.add_ons, not here.';
