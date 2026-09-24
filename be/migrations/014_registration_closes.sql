-- STE-46 — an event's registration close date, as the chain enforces it.
--
-- EventRegistry v2.5 refuses entries at or after `closes_at` (unix seconds,
-- the ledger's clock). The race page and the console need that date without an
-- RPC call per event, and `doctor` needs something to compare it with.
--
-- NULL means the event has no date: entries stop only when the organiser closes
-- them. That is every event created before v2.5.
--
-- numeric(20,0), not bigint: the contract takes any u64, and u64::MAX is a
-- legal "never" that a bigint column would refuse, stopping the poller on a
-- value the chain accepted.

ALTER TABLE events
    ADD COLUMN registration_closes_at numeric(20, 0)
        CONSTRAINT registration_closes_at_is_a_u64
        CHECK (registration_closes_at >= 0 AND registration_closes_at <= 18446744073709551615);

COMMENT ON COLUMN events.registration_closes_at IS
    'Unix seconds; entries are refused from this moment (EventRegistry v2.5, STE-46). NULL = closes manually only.';
