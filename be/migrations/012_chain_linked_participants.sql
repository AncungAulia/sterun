-- STE-59 — link a vault row to its race record from the chain.
--
-- Entering took three wallet approvals: the signed message for the vault, the
-- `enter` transaction, and a third signature only to call
-- POST /participants/:id/confirm and tell this service something the chain
-- already says. The indexer now links the row itself when it sees the record,
-- and the web app can drop that third step.
--
-- A row linked that way may not know its `enter` transaction: the poller does,
-- but a rebuild reads contract state, which carries no transaction hash, and
-- getEvents only keeps about a week. So the hash becomes optional once a row is
-- linked, while "a token id always arrives with a confirmation time" stays.

ALTER TABLE participants DROP CONSTRAINT confirmation_is_all_or_nothing;

ALTER TABLE participants
    ADD CONSTRAINT confirmation_is_all_or_nothing CHECK (
        (token_id IS NULL) = (confirmed_at IS NULL)
        AND (enter_tx_hash IS NULL OR token_id IS NOT NULL)
    );

-- Who linked it. NULL for rows confirmed before this migration, which all came
-- through the route.
ALTER TABLE participants
    ADD COLUMN linked_by text CONSTRAINT linked_by_is_known CHECK (linked_by IN ('confirm', 'chain'));

COMMENT ON COLUMN participants.linked_by IS
    'confirm = POST /participants/:id/confirm; chain = the indexer matched the record (STE-59).';
