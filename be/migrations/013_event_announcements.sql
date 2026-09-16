-- STE-40 — signed event announcements.
--
-- A published event document is frozen by its hash (STE-34). When a race moves
-- venue, extends registration or raises a quota, the organiser says so in an
-- announcement beside the document instead (docs/WEB_APP_IA.md §6.1).
--
-- Two properties decide this schema:
--
-- * Append-only. A record of change that can itself be changed proves nothing,
--   so a correction is a new row. That is enforced HERE, by triggers, and not
--   only by the absence of an UPDATE in the code: the database is the last
--   place a well-meaning maintenance query could otherwise rewrite history.
--
-- * Self-contained for re-verification. Each row keeps everything needed to
--   rebuild the exact signed message (network, registry, event, time, body) and
--   the signature, so anyone can check it without trusting this service. The
--   network and registry are stored per row, not taken from today's config: an
--   announcement must stay verifiable after a registry address changes.
--
-- Not an index table. Nothing here can be rebuilt from the chain, so it is not
-- touched by `pnpm indexer rebuild`, and there is deliberately no foreign key to
-- `events`: the authority for "who may announce" is get_organiser read from the
-- chain at publish time, and an event the poller has not indexed yet is still a
-- real event.

CREATE TABLE event_announcements (
    id                  bigserial PRIMARY KEY,
    event_id            integer NOT NULL CHECK (event_id >= 0),
    -- The time the organiser signed, inside the message.
    published_at        timestamptz NOT NULL,
    body                text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    body_sha256         bytea NOT NULL CHECK (octet_length(body_sha256) = 32),
    signer              text NOT NULL CHECK (signer ~ '^G[A-Z2-7]{55}$'),
    -- Unique: the same signed announcement submitted twice is one announcement.
    signature           bytea NOT NULL UNIQUE CHECK (octet_length(signature) = 64),
    scheme              text NOT NULL CHECK (scheme IN ('ed25519', 'sep53')),
    network_passphrase  text NOT NULL,
    event_registry      text NOT NULL CHECK (event_registry ~ '^C[A-Z2-7]{55}$'),
    -- The time this service accepted it. Not signed; for operators only.
    received_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX event_announcements_event_idx
    ON event_announcements (event_id, published_at DESC, id DESC);

CREATE FUNCTION event_announcements_append_only() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'event_announcements is append-only: publish a new announcement instead of changing or removing one'
        USING ERRCODE = 'restrict_violation';
END
$$;

CREATE TRIGGER event_announcements_no_update_or_delete
    BEFORE UPDATE OR DELETE ON event_announcements
    FOR EACH ROW EXECUTE FUNCTION event_announcements_append_only();

CREATE TRIGGER event_announcements_no_truncate
    BEFORE TRUNCATE ON event_announcements
    FOR EACH STATEMENT EXECUTE FUNCTION event_announcements_append_only();
