-- STE-51 — one entry per person per race.
--
-- The rule comes from real Indonesian race regulations: one person enters one
-- category of a race. The contract cannot enforce it, because the chain holds
-- only a salted hash and two entries by one person look unrelated there. The
-- web app stops a second entry from the same WALLET; this column stops the same
-- PERSON using another wallet.
--
-- The identity number is encrypted, and AES-GCM with a fresh nonce never gives
-- the same ciphertext twice, so the ciphertext cannot be compared. This is a
-- blind index instead: HMAC-SHA256 of the event id and the normalised number,
-- under a server key (PII_INDEX_KEY) that is not a PII key. Never a plain hash:
-- an identity number is a short, structured, guessable value, and sha256 of
-- one is reversed by enumerating the space. Without the key, this column is 32
-- random-looking bytes per row.
--
-- The event id is inside the HMAC, so the same person in two races produces two
-- unrelated values: this column cannot be used to follow someone from race to
-- race, even by someone reading the table.
--
-- Nullable because rows written before this migration have no value, and
-- computing one needs the decrypted number. Those rows do not block anyone.

ALTER TABLE participants
    ADD COLUMN identity_index bytea
        CONSTRAINT identity_index_is_a_sha256_hmac
        CHECK (identity_index IS NULL OR octet_length(identity_index) = 32);

-- Only confirmed rows can refuse an entry, so only they need to be found fast.
-- Deliberately NOT unique: the check runs at submit, and a unique index would
-- instead fire at confirm — after the runner has already paid on chain, which
-- would leave a paid record with no vault row and no pass.
CREATE INDEX participants_identity_index_idx ON participants (identity_index)
    WHERE token_id IS NOT NULL;

COMMENT ON COLUMN participants.identity_index IS
    'HMAC-SHA256(PII_INDEX_KEY, domain || u32be(event_id) || norm_id(national_id)). STE-51.';
