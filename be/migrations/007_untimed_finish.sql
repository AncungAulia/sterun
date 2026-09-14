-- STE-41 follow-up — the index accepts a Finished record with no finish time.
--
-- ## Why this exists
--
-- RaceRecord v2.2 added `record_finish_untimed` (docs/specs/CHANGELOG.md
-- [2.2.0]): a runner who crossed the line at a race with no chip timing is
-- `Finished` with `finish_time_s = None`. Before v2.2 that combination could not
-- exist, so 002 encoded "Finished implies a time" as a constraint.
--
-- That constraint was right when written and is now a lie about the chain, and
-- it fails in the worst way: the poller silently skipped the new event (its name
-- was unknown), so the index drifted, and `pnpm indexer rebuild` — the command
-- that exists to repair drift — would abort its whole transaction on the first
-- untimed record it read from state. Two such records were on testnet before
-- this migration was written (tokens 14 and 17).
--
-- ## What changes
--
-- Only the time half of the constraint is dropped. "Finished implies a claimed
-- race pack" still mirrors the contract's own guard — both `record_finish` and
-- `record_finish_untimed` refuse a record that is not RacepackClaimed — so an
-- unclaimed Finished row still means the indexer invented something.
--
-- `finish_time_s > 0` stays too: NULL passes a CHECK, and a zero is still
-- something `record_finish` refuses, so a 0 in this column is still a bug.
ALTER TABLE records
    DROP CONSTRAINT finished_records_were_claimed;

ALTER TABLE records
    ADD CONSTRAINT finished_records_were_claimed
    CHECK (state <> 'Finished' OR claimed_at IS NOT NULL);

COMMENT ON COLUMN records.finish_time_s IS
    'Net finish time in whole seconds. NULL on a Finished record means finished '
    'with no official time (record_finish_untimed, v2.2) — never render it as 0.';
