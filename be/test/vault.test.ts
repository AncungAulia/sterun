/**
 * The PII vault, against a real Postgres.
 *
 * The four things STE-11 says a third party must be able to check are checked
 * here, three of them by looking at what the database actually holds rather
 * than at what the code intended:
 *
 *   1. the PII columns contain no plaintext (queried straight from the table);
 *   2. the frozen hash vectors produce the hash that gets stored;
 *   3. no route returns PII (routes.test.ts);
 *   4. no response schema mentions a PII field (routes.test.ts).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { Keyring } from "../src/crypto/keyring.js";
import { Vault, AlreadyConfirmedError, ParticipantNotFoundError } from "../src/vault.js";
import { participantHash, saltFromHex } from "../src/spec/participant-hash.js";
import { codeAt } from "../src/spec/totp.js";
import { DATABASE_URL, SKIP_REASON, freshDatabase } from "./helpers/db.js";

const RUNNER = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";
const PERSON = {
  name: "Budi Santoso",
  nationalId: "3174012509900001",
  emergencyContact: "+6281234567890",
};
const ENTRY = { ...PERSON, eventId: 0, categoryId: 0, runnerAddress: RUNNER };

describe.skipIf(!DATABASE_URL)(`vault (${DATABASE_URL ? "postgres" : SKIP_REASON})`, () => {
  let pool: Pool;
  let keyring: Keyring;
  let close: () => Promise<void>;
  let vault: Vault;

  beforeAll(async () => {
    ({ pool, keyring, close } = await freshDatabase());
    vault = new Vault(pool, keyring);
  });
  afterAll(async () => close?.());

  describe("submit", () => {
    it("stores the entry and returns hash, salt and TOTP secret", async () => {
      const r = await vault.submit(ENTRY);
      expect(r.participantHash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.saltHex).toMatch(/^[0-9a-f]{64}$/);
      expect(r.totpSecretHex).toMatch(/^[0-9a-f]{64}$/);
      // The hash must be reproducible from the salt it handed back — that is
      // what lets the runner prove their own record without us.
      expect(participantHash(PERSON, saltFromHex(r.saltHex))).toBe(r.participantHash);
    });

    it("keeps NO plaintext in the PII columns — checked against stored bytes", async () => {
      const r = await vault.submit(ENTRY);
      const { rows } = await pool.query<{
        name_enc: Buffer;
        national_id_enc: Buffer;
        emergency_contact_enc: Buffer;
      }>("SELECT name_enc, national_id_enc, emergency_contact_enc FROM participants WHERE id=$1", [
        r.participantId,
      ]);
      const stored = Buffer.concat([
        rows[0]!.name_enc,
        rows[0]!.national_id_enc,
        rows[0]!.emergency_contact_enc,
      ]);
      for (const secret of [PERSON.name, PERSON.nationalId, PERSON.emergencyContact, "Budi", "6281234567890"]) {
        expect(stored.includes(Buffer.from(secret, "utf8"))).toBe(false);
      }
    });

    it("has no text column anywhere that could hold a person", async () => {
      // Stronger than checking the three columns we know about: if someone adds
      // a `notes text` column later and writes a name into it, this fails.
      const { rows } = await pool.query<{ column_name: string; data_type: string }>(
        // current_schema() matters: each test file gets its own schema, and
        // without it this sees every parallel suite's `participants` too.
        `SELECT column_name, data_type FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'participants'
            AND data_type IN ('text','character varying')`,
      );
      // runner_address and enter_tx_hash are public on-chain values, not PII.
      expect(rows.map((r) => r.column_name).sort()).toEqual(["enter_tx_hash", "runner_address"]);
    });

    it("gives every entry its own salt, so one person's two events do not collide", async () => {
      const a = await vault.submit(ENTRY);
      const b = await vault.submit({ ...ENTRY, eventId: 1 });
      expect(a.saltHex).not.toBe(b.saltHex);
      expect(a.participantHash).not.toBe(b.participantHash);
    });

    it("gives every entry its own TOTP secret", async () => {
      const a = await vault.submit(ENTRY);
      const b = await vault.submit(ENTRY);
      expect(a.totpSecretHex).not.toBe(b.totpSecretHex);
    });

    it("refuses a blank name without leaving a row behind", async () => {
      const before = await pool.query("SELECT count(*) FROM participants");
      await expect(vault.submit({ ...ENTRY, name: "   \t \n " })).rejects.toThrow(/E_EMPTY/);
      const after = await pool.query("SELECT count(*) FROM participants");
      expect(after.rows[0]).toEqual(before.rows[0]);
    });

    it("refuses an id that is only separators (the N5 trap)", async () => {
      await expect(vault.submit({ ...ENTRY, nationalId: " -- - " })).rejects.toThrow(/E_EMPTY/);
    });

    it("rejects a malformed runner address at the database boundary", async () => {
      await expect(vault.submit({ ...ENTRY, runnerAddress: "not-an-address" })).rejects.toThrow();
    });
  });

  describe("what comes back out", () => {
    it("round-trips PII only through the audit path", async () => {
      const r = await vault.submit(ENTRY);
      expect(await vault.decryptForAudit(r.participantId)).toEqual(PERSON);
    });

    it("summary carries no PII at all", async () => {
      const r = await vault.submit(ENTRY);
      const summary = await vault.summary(r.participantId);
      const serialised = JSON.stringify(summary);
      for (const secret of [PERSON.name, PERSON.nationalId, PERSON.emergencyContact]) {
        expect(serialised).not.toContain(secret);
      }
      expect(summary).toMatchObject({ eventId: 0, categoryId: 0, runnerAddress: RUNNER, tokenId: null });
    });

    it("returns null for an unknown id rather than throwing", async () => {
      expect(await vault.summary(randomUUID())).toBeNull();
    });
  });

  describe("confirm", () => {
    it("links the row to the on-chain record", async () => {
      const r = await vault.submit(ENTRY);
      const tx = "a".repeat(64);
      await vault.confirm(r.participantId, 42, tx);
      const s = await vault.summary(r.participantId);
      expect(s?.tokenId).toBe(42);
      expect(s?.confirmedAt).toBeInstanceOf(Date);
    });

    it("is idempotent for the same token_id — a dropped response must be retryable", async () => {
      const r = await vault.submit(ENTRY);
      const tx = "b".repeat(64);
      await vault.confirm(r.participantId, 43, tx);
      await expect(vault.confirm(r.participantId, 43, tx)).resolves.toMatchObject({ tokenId: 43 });
    });

    it("refuses to re-point a confirmed row at a different token_id", async () => {
      const r = await vault.submit(ENTRY);
      await vault.confirm(r.participantId, 44, "c".repeat(64));
      await expect(vault.confirm(r.participantId, 45, "d".repeat(64))).rejects.toBeInstanceOf(
        AlreadyConfirmedError,
      );
    });

    it("refuses two participants claiming one token_id — one bib, one person", async () => {
      const a = await vault.submit(ENTRY);
      const b = await vault.submit(ENTRY);
      await vault.confirm(a.participantId, 46, "e".repeat(64));
      await expect(vault.confirm(b.participantId, 46, "f".repeat(64))).rejects.toThrow();
    });

    it("refuses an unknown participant", async () => {
      await expect(vault.confirm(randomUUID(), 47, "0".repeat(64))).rejects.toBeInstanceOf(
        ParticipantNotFoundError,
      );
    });

    it("refuses a confirmation without a real transaction hash", async () => {
      const r = await vault.submit(ENTRY);
      await expect(vault.confirm(r.participantId, 48, "not-a-hash")).rejects.toThrow();
    });
  });

  describe("roster handoff (what STE-16 will read)", () => {
    it("returns the TOTP secret for a confirmed record, and it mints working codes", async () => {
      const r = await vault.submit(ENTRY);
      await vault.confirm(r.participantId, 49, "1".repeat(64));
      const secret = await vault.totpSecretForToken(49);
      expect(secret?.toString("hex")).toBe(r.totpSecretHex);
      // The secret stored is the secret the runner's pass holds, so the code
      // the scanner derives is the code the pass shows.
      expect(codeAt(secret!, 1772100000)).toBe(codeAt(Buffer.from(r.totpSecretHex, "hex"), 1772100000));
    });

    it("has nothing for a token_id that was never confirmed", async () => {
      expect(await vault.totpSecretForToken(999_999)).toBeNull();
    });
  });

  describe("race pack choices (STE-17)", () => {
    it("hands the organiser back what the runner picked", async () => {
      // The reason the column exists: sizes have to come back out in bulk, or
      // the organiser cannot place the shirt order. Everything else in this
      // table is written to never come back out at all.
      const r = await vault.submit({
        ...ENTRY,
        eventId: 7100,
        addOns: [
          { item: "Event jersey", choice: "L" },
          { item: "Cap", choice: "One size" },
        ],
      });
      await vault.confirm(r.participantId, 7101, "2".repeat(64));

      const [entry] = await vault.rosterSecretsForEvent(7100);

      expect(entry?.addOns).toEqual([
        { item: "Event jersey", choice: "L" },
        { item: "Cap", choice: "One size" },
      ]);
    });

    it("is stored in the clear, unlike every other per-runner column", async () => {
      // Deliberate, and worth a test rather than a comment: a shirt size
      // identifies nobody, and encrypting it would mean either a new decrypt
      // path out of the vault or an organiser who cannot count their own order.
      const r = await vault.submit({
        ...ENTRY,
        eventId: 7102,
        addOns: [{ item: "Event jersey", choice: "XXL" }],
      });

      const { rows } = await pool.query<{ add_ons: unknown }>(
        "SELECT add_ons FROM participants WHERE id = $1",
        [r.participantId],
      );

      expect(rows[0]?.add_ons).toEqual([{ item: "Event jersey", choice: "XXL" }]);
    });

    it("is an empty list for a race that hands out nothing to choose", async () => {
      // The common case, and the state of every row written before the column
      // existed. One representation, so nobody counting sizes has to decide
      // what null meant.
      const r = await vault.submit({ ...ENTRY, eventId: 7103 });
      await vault.confirm(r.participantId, 7104, "3".repeat(64));

      const [entry] = await vault.rosterSecretsForEvent(7103);

      expect(entry?.addOns).toEqual([]);
    });

    it("refuses a row whose add_ons is not a list", async () => {
      // The check constraint is the only thing that says what shape the rest of
      // the code may assume, since jsonb itself takes any valid json.
      await expect(
        pool.query(
          `INSERT INTO participants
             (id, name_enc, national_id_enc, emergency_contact_enc, salt, totp_secret,
              participant_hash, event_id, category_id, runner_address, add_ons)
           VALUES ($1,'\x00','\x00','\x00','\x00','\x00','\x00',0,0,$2,$3)`,
          [randomUUID(), RUNNER, JSON.stringify({ "Event jersey": "L" })],
        ),
      ).rejects.toThrow(/add_ons_is_a_list/);
    });
  });
});
