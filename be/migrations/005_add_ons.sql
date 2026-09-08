-- STE-17 — what a runner picked from the race pack, mostly a jersey size.
--
-- ## Why this is not in the vault
--
-- Every other per-runner column here is encrypted, and this one is not. That is
-- a deliberate exception, not an oversight, and it rests on two facts.
--
-- It is not PII. "Event jersey: L" identifies nobody. It carries no name, no
-- number, no contact, and it is worthless to anybody who steals this database:
-- a dump of this column is a list of shirt sizes against bib numbers.
--
-- The organiser has to read it. The whole point of collecting a size is to
-- order the shirts, so it has to come back out in the roster, in bulk, as
-- something countable. The vault is built the other way round on purpose (there
-- is no route that returns a name, and `decryptForAudit` is named to be
-- uncomfortable), so putting a size in there would mean either a new decrypt
-- path out of the vault or an organiser who cannot count their own order. Both
-- are worse than a plain column holding a non-secret.
--
-- ## Why jsonb rather than a column per item
--
-- What is on offer is decided per event by the organiser, in the event document
-- (`add_ons`), and it is different for every race: a jersey, a tumbler, a cap.
-- There is no fixed set to model, and a `jersey_size text` column would be
-- obsolete the first time somebody sells a jacket.
--
-- The shape is a list of choices, in the order the document lists the items:
--
--     [{"item": "Event jersey", "choice": "L"}, {"item": "Cap", "choice": "One size"}]
--
-- A list of pairs rather than an object keyed by item name, for one reason that
-- is not about this file: every response schema in this service is closed
-- (`additionalProperties: false`), and there is a test that fails if one is
-- not. A map cannot be closed, an array of two-field objects can, and the same
-- shape on the wire and in the column means no translation to get wrong.
--
-- Names rather than ids because the document has no ids: it is hashed and
-- frozen at `create_event`, so a name in it cannot change under a row that
-- refers to it. That is the property an id would have bought, without inventing
-- one.
--
-- ## Why the default is an empty array rather than NULL
--
-- Every row written before this migration chose nothing, and so does every
-- entry to a race that hands out nothing but a bib. Those are the same state,
-- and `[]` says it once. A reader counting sizes never has to decide what NULL
-- meant.
ALTER TABLE participants
    ADD COLUMN add_ons jsonb NOT NULL DEFAULT '[]'::jsonb;

-- An array, never an object or a scalar. Postgres will take any valid json in a
-- jsonb column, and this is the only place that says what shape the rest of the
-- code is entitled to assume.
ALTER TABLE participants
    ADD CONSTRAINT add_ons_is_a_list CHECK (jsonb_typeof(add_ons) = 'array');

COMMENT ON COLUMN participants.add_ons IS
    'What the runner picked from the race pack, as [{"item","choice"}], e.g. '
    '[{"item": "Event jersey", "choice": "L"}]. Not PII and deliberately not '
    'encrypted: the organiser reads it in bulk to place the order. Item names '
    'match the frozen event document''s add_ons.';
