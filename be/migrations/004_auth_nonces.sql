-- STE-31 — auth nonces, so more than one instance can serve the API.
--
-- The in-memory store was honest for one process and dishonest for two: a nonce
-- issued by instance A and presented to instance B would simply not be found,
-- and the client would be told "unknown-nonce" — a lie that only appears under
-- load, only sometimes, and points the reader at the wrong thing entirely.
--
-- The single-use property is enforced by `DELETE … RETURNING` rather than by a
-- read followed by a delete. That statement is atomic: two instances presenting
-- the same nonce at the same moment produce exactly one row between them, and
-- the loser gets nothing. A SELECT-then-DELETE would let both through in the
-- window between the two, which is precisely the replay this table exists to
-- prevent.
--
-- Rows are short-lived (two minutes) and swept on issue, so this table stays
-- small; the index on expires_at is what makes the sweep cheap.
CREATE TABLE auth_nonces (
    nonce       text PRIMARY KEY CHECK (nonce ~ '^[0-9a-f]{64}$'),
    address     text NOT NULL CHECK (address ~ '^G[A-Z2-7]{55}$'),
    expires_at  timestamptz NOT NULL,
    issued_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_nonces_expires_at_idx ON auth_nonces (expires_at);
