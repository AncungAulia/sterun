-- STE-16 (C8) — the one thing the roster bundle needs from the vault that
-- 001 did not store: a reduced form of the runner's name.
--
-- `docs/SYSTEM_DESIGN.md` §7 point 3 and the STE-16 ticket both specify the
-- roster as `token_id -> totp_secret, bib, name-fragment`. The fragment is what
-- lets a volunteer at the desk see that the phone in front of them belongs to
-- the bib on the screen; without it the scanner shows a number and the
-- volunteer has nothing to sanity-check against.
--
-- Two decisions keep this inside be/CLAUDE.md rule 2 rather than beside it:
--
--   It is a FRAGMENT, computed once at submit time (given name in full, every
--   later name reduced to an initial) and stored instead of the name. There is
--   no code path that can turn this column back into a legal name, because the
--   information is not in it.
--
--   It is still ENCRYPTED, with the same envelope and the same per-row AAD as
--   the other three columns. A leaked dump of this database therefore reveals
--   exactly what it revealed before this migration: nothing readable.
--
-- Nullable, because rows written before this migration have no fragment and
-- there is no way to compute one without the plaintext. The roster reports
-- those as null rather than pretending.
ALTER TABLE participants
    ADD COLUMN name_fragment_enc bytea;

COMMENT ON COLUMN participants.name_fragment_enc IS
    'AES-256-GCM envelope of the reduced display name (given name + initials), '
    'AAD pii.name_fragment:<row id>. For the STE-16 roster bundle. Never the full name.';
