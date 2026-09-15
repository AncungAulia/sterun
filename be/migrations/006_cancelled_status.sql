-- STE-35 — the index accepts `Cancelled`, the fifth event status v2 can emit.
--
-- ## Why this migration exists at all
--
-- `INTERFACE.md` §8 lists what has to change for v2 and names two places: the
-- decoder's status list and the two JSON schemas that serialise it. It does not
-- name this one, and this one is the only one Postgres enforces.
--
-- Without it the failure arrives late and reads like a bug in the poller: the
-- decoder happily produces `Cancelled`, the route schema happily describes it,
-- and then the INSERT is rejected by a CHECK constraint written when four
-- statuses were all there were. The poller stops on the first cancelled event
-- it sees, and the reason is a constraint name.
--
-- ## Why it is safe to land before anything points at v2
--
-- The v1 EventRegistry cannot emit `Cancelled` — the variant does not exist in
-- its wasm — so widening the constraint changes nothing that can happen today.
-- It only removes a way for the switch to v2 to fail. That ordering is the
-- point: a constraint that has to be widened *during* a migration is a
-- constraint that will be discovered by an outage.
--
-- ## What this migration deliberately does NOT do
--
-- It does not add a column telling v1 rows apart from v2 rows, and that gap is
-- real: `events.event_id` and `records.token_id` are bare primary keys, so v2
-- event 0 and v1 event 0 are the same row. Pointing this backend at a v2
-- address without dealing with that would let one contract's ids overwrite the
-- other's — and `participants` links real identity documents to those same ids,
-- so the damage would not stop at the index.
--
-- That is a migration with a plan behind it, not a column added in passing.
-- Written up in be/OPERATIONS.md under "Pindah ke kontrak v2".
ALTER TABLE events
    DROP CONSTRAINT IF EXISTS events_status_check;

ALTER TABLE events
    ADD CONSTRAINT events_status_check
    CHECK (status IN ('Draft', 'Open', 'Closed', 'Completed', 'Cancelled'));

COMMENT ON COLUMN events.status IS
    'Event lifecycle status. `Cancelled` is v2-only (STE-35); the v1 contract '
    'cannot emit it. Mirrors EventStatus in docs/specs/INTERFACE.md.';
