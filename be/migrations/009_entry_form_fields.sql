-- STE-47 — what the entry form collects beyond the three hashed fields.
--
-- Three gaps the entry form (STE-21) could not ship with: Sterun had no way to
-- reach somebody who has paid (and STE-34's answer to a postponed race is an
-- announcement, which needs a recipient); podiums are split by gender and age,
-- and neither was stored; and the emergency contact was one free-text field
-- that in practice held a name and a number.
--
-- ## What is encrypted and what is not
--
-- Five columns identify or describe a person and follow the vault's rule:
-- AES-256-GCM envelopes with the per-row AAD, `bytea`, never `text`.
--
-- Two do not, deliberately:
--
--   id_type    which kind of document was given. "passport" identifies nobody.
--   bib_name   what gets PRINTED on the bib, chosen by the runner for exactly
--              that purpose. Encrypting a value whose whole job is to be shown
--              to the crowd at the start line protects nothing.
--
-- ## Why date_of_birth and not an age
--
-- A record is permanent and an age is not. Storing 34 would be wrong a year
-- later with no way to tell. The age group is worked out on race day from the
-- date.
--
-- ## Why every column is nullable
--
-- Rows written before this migration have none of these values, and there is
-- no way to derive them. The API requires them for every new submission; the
-- database cannot distinguish old rows from new, so it does not pretend to.
--
-- ## What did NOT change
--
-- participant_hash is still SHA-256(name, national_id, emergency_contact, salt)
-- per docs/specs/HASH_AND_TOTP.md. None of these columns is hashed and nothing
-- here touches the frozen spec. emergency_contact_enc now holds an E.164 number
-- for new rows — enforced by the API, because norm_contact does not add a
-- country code and two spellings of one number would hash differently.
ALTER TABLE participants
    ADD COLUMN id_type text
        CHECK (id_type IN ('national_id_card', 'passport', 'driving_licence', 'other')),
    ADD COLUMN bib_name text
        CHECK (char_length(bib_name) BETWEEN 1 AND 16),
    ADD COLUMN email_enc bytea,
    ADD COLUMN phone_enc bytea,
    ADD COLUMN gender_enc bytea,
    ADD COLUMN date_of_birth_enc bytea,
    ADD COLUMN emergency_contact_name_enc bytea;

COMMENT ON COLUMN participants.bib_name IS
    'Printed on the bib, chosen by the runner. Not encrypted on purpose: it is public at the start line.';
COMMENT ON COLUMN participants.date_of_birth_enc IS
    'AES-256-GCM envelope of YYYY-MM-DD, AAD pii.date_of_birth:<row id>. A date, never an age.';
