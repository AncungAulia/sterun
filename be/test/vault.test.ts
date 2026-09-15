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
import { identityIndex } from "../src/crypto/blind-index.js";
import {
  Vault,
  AlreadyConfirmedError,
  AlreadyEnteredError,
  ParticipantNotFoundError,
} from "../src/vault.js";
import { participantHash, saltFromHex } from "../src/spec/participant-hash.js";
import { codeAt } from "../src/spec/totp.js";
import { DATABASE_URL, SKIP_REASON, freshDatabase } from "./helpers/db.js";

const RUNNER = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";
const PERSON = {
  name: "Budi Santoso",
  nationalId: "3174012509900001",
  emergencyContact: "+6281234567890",
};
/** STE-47: the entry form's fields. Not part of the hash. */
const FORM = {
  idType: "passport" as const,
  bibName: "BUDI",
  email: "budi.santoso@example.com",
  phone: "+6281398765432",
  gender: "male" as const,
  dateOfBirth: "1990-05-17",
  emergencyContactName: "Siti Rahayu",
};
const ENTRY = { ...PERSON, ...FORM, eventId: 0, categoryId: 0, runnerAddress: RUNNER };

describe.skipIf(!DATABASE_URL)(`vault (${DATABASE_URL ? "postgres" : SKIP_REASON})`, () => {
  let pool: Pool;
  let keyring: Keyring;
  let indexKey: Buffer;
  let close: () => Promise<void>;
  let vault: Vault;

  beforeAll(async () => {
    ({ pool, keyring, indexKey, close } = await freshDatabase());
    vault = new Vault(pool, keyring, indexKey);
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
      // id_type (STE-47) says which kind of document was given, and "passport"
      // identifies nobody. bib_name (STE-47) is the one text column that can
      // hold a name, and holds it on purpose: it is chosen by the runner to be
      // printed on the bib and read by the crowd, so encrypting it protects
      // nothing. linked_by (STE-59) is `confirm` or `chain`, enforced by a CHECK,
      // so it cannot hold anything else. Anything else appearing here is still
      // a failure.
      expect(rows.map((r) => r.column_name).sort()).toEqual([
        "bib_name",
        "enter_tx_hash",
        "id_type",
        "linked_by",
        "runner_address",
      ]);
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

  describe("the entry form's fields (STE-47)", () => {
    it("keeps no plaintext in the five new encrypted columns — checked against stored bytes", async () => {
      const r = await vault.submit(ENTRY);
      const { rows } = await pool.query<Record<string, Buffer>>(
        `SELECT email_enc, phone_enc, gender_enc, date_of_birth_enc, emergency_contact_name_enc
           FROM participants WHERE id = $1`,
        [r.participantId],
      );
      const row = rows[0] ?? {};
      const secrets = [FORM.email, FORM.phone, FORM.gender, FORM.dateOfBirth, FORM.emergencyContactName];
      for (const [column, bytes] of Object.entries(row)) {
        expect(Buffer.isBuffer(bytes), column).toBe(true);
        for (const secret of secrets) expect(bytes.includes(Buffer.from(secret)), column).toBe(false);
      }
    });

    it("stores id_type and bib_name in the clear, which is the point of each", async () => {
      const r = await vault.submit(ENTRY);
      const { rows } = await pool.query<{ id_type: string; bib_name: string }>(
        "SELECT id_type, bib_name FROM participants WHERE id = $1",
        [r.participantId],
      );
      expect(rows[0]).toEqual({ id_type: "passport", bib_name: "BUDI" });
    });

    it("binds each new ciphertext to its own column, so two cannot be swapped", async () => {
      // The AAD is "<column>:<row id>". A ciphertext copied from phone to email
      // must fail to decrypt rather than read back as someone's email.
      const r = await vault.submit(ENTRY);
      await pool.query("UPDATE participants SET email_enc = phone_enc WHERE id = $1", [r.participantId]);
      await expect(vault.decryptForAudit(r.participantId)).rejects.toThrow();
    });

    it("does not change the hash: the form fields are not part of participant_hash", async () => {
      const r = await vault.submit(ENTRY);
      const other = await vault.submit({ ...ENTRY, email: "someone.else@example.com", bibName: "X" });
      expect(participantHash(PERSON, saltFromHex(r.saltHex))).toBe(r.participantHash);
      expect(participantHash(PERSON, saltFromHex(other.saltHex))).toBe(other.participantHash);
    });

    it("refuses a bib name longer than a bib at the database, not only at the API", async () => {
      await expect(vault.submit({ ...ENTRY, bibName: "X".repeat(17) })).rejects.toThrow(/bib_name/);
    });
  });

  describe("what comes back out", () => {
    it("round-trips PII only through the audit path", async () => {
      const r = await vault.submit(ENTRY);
      expect(await vault.decryptForAudit(r.participantId)).toEqual({ ...PERSON, ...FORM });
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
    // Each confirming test enters its own race: since STE-51 a confirmed entry
    // refuses the same person in the same race, which is the rule, not noise.
    it("links the row to the on-chain record", async () => {
      const r = await vault.submit({ ...ENTRY, eventId: 4200 });
      const tx = "a".repeat(64);
      await vault.confirm(r.participantId, 42, tx);
      const s = await vault.summary(r.participantId);
      expect(s?.tokenId).toBe(42);
      expect(s?.confirmedAt).toBeInstanceOf(Date);
    });

    it("is idempotent for the same token_id — a dropped response must be retryable", async () => {
      const r = await vault.submit({ ...ENTRY, eventId: 4201 });
      const tx = "b".repeat(64);
      await vault.confirm(r.participantId, 43, tx);
      await expect(vault.confirm(r.participantId, 43, tx)).resolves.toMatchObject({ tokenId: 43 });
    });

    it("refuses to re-point a confirmed row at a different token_id", async () => {
      const r = await vault.submit({ ...ENTRY, eventId: 4202 });
      await vault.confirm(r.participantId, 44, "c".repeat(64));
      await expect(vault.confirm(r.participantId, 45, "d".repeat(64))).rejects.toBeInstanceOf(
        AlreadyConfirmedError,
      );
    });

    it("refuses two participants claiming one token_id — one bib, one person", async () => {
      const a = await vault.submit({ ...ENTRY, eventId: 4203 });
      const b = await vault.submit({ ...ENTRY, eventId: 4203, nationalId: "3174012509900002" });
      await vault.confirm(a.participantId, 46, "e".repeat(64));
      await expect(vault.confirm(b.participantId, 46, "f".repeat(64))).rejects.toThrow();
    });

    it("refuses an unknown participant", async () => {
      await expect(vault.confirm(randomUUID(), 47, "0".repeat(64))).rejects.toBeInstanceOf(
        ParticipantNotFoundError,
      );
    });

    it("refuses a confirmation without a real transaction hash", async () => {
      const r = await vault.submit({ ...ENTRY, eventId: 4204 });
      await expect(vault.confirm(r.participantId, 48, "not-a-hash")).rejects.toThrow();
    });
  });

  describe("roster handoff (what STE-16 will read)", () => {
    it("returns the TOTP secret for a confirmed record, and it mints working codes", async () => {
      const r = await vault.submit({ ...ENTRY, eventId: 4205 });
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
      // the code may assume, since jsonb itself takes any valid json. Written
      // straight to the table, because no code path we own can produce this.
      const bytes = Buffer.alloc(1);
      await expect(
        pool.query(
          `INSERT INTO participants
             (id, name_enc, national_id_enc, emergency_contact_enc, salt, totp_secret,
              participant_hash, event_id, category_id, runner_address, add_ons)
           VALUES ($1,$2,$2,$2,$2,$2,$2,0,0,$3,$4)`,
          [randomUUID(), bytes, RUNNER, JSON.stringify({ "Event jersey": "L" })],
        ),
      ).rejects.toThrow(/add_ons_is_a_list/);
    });
  });

  describe("one person, one entry per race (STE-51)", () => {
    // Event ids 5100+ belong to this block, so no other test's confirmed row
    // for the shared fixture can refuse an entry here.
    const OTHER_WALLET = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
    let nextToken = 51_000;
    const enterAndConfirm = async (entry: Parameters<Vault["submit"]>[0]) => {
      const r = await vault.submit(entry);
      await vault.confirm(r.participantId, nextToken++, "5".repeat(64));
      return r;
    };
    const rowsFor = async (eventId: number) =>
      Number(
        (
          await pool.query<{ n: string }>(
            "SELECT count(*) AS n FROM participants WHERE event_id = $1",
            [eventId],
          )
        ).rows[0]?.n,
      );

    it("refuses a second entry by the same identity number from another wallet", async () => {
      await enterAndConfirm({ ...ENTRY, eventId: 5100 });

      await expect(
        vault.submit({ ...ENTRY, eventId: 5100, runnerAddress: OTHER_WALLET }),
      ).rejects.toThrow(AlreadyEnteredError);
      // Refused before anything is written: no second row of PII to clean up.
      expect(await rowsFor(5100)).toBe(1);
    });

    it("refuses it in another category of the same race too", async () => {
      await enterAndConfirm({ ...ENTRY, eventId: 5101, categoryId: 0 });
      await expect(vault.submit({ ...ENTRY, eventId: 5101, categoryId: 1 })).rejects.toThrow(
        AlreadyEnteredError,
      );
    });

    it("treats `34-04 0125` and `34040125` as the same person", async () => {
      await enterAndConfirm({ ...ENTRY, eventId: 5102, nationalId: "34-04 0125" });
      await expect(
        vault.submit({ ...ENTRY, eventId: 5102, nationalId: "34040125", runnerAddress: OTHER_WALLET }),
      ).rejects.toThrow(AlreadyEnteredError);
    });

    it("accepts the same identity number in a different race", async () => {
      await enterAndConfirm({ ...ENTRY, eventId: 5103 });
      await expect(vault.submit({ ...ENTRY, eventId: 5104 })).resolves.toMatchObject({
        participantId: expect.any(String),
      });
    });

    it("accepts a different person in the same race", async () => {
      await enterAndConfirm({ ...ENTRY, eventId: 5105 });
      await expect(
        vault.submit({ ...ENTRY, eventId: 5105, nationalId: "3174012509900002" }),
      ).resolves.toBeDefined();
    });

    it("does not let an unconfirmed attempt lock the runner out", async () => {
      // A declined payment leaves an unconfirmed row. The retry must go through,
      // and so must the one after that.
      await vault.submit({ ...ENTRY, eventId: 5106 });
      await vault.submit({ ...ENTRY, eventId: 5106 });
      const third = await vault.submit({ ...ENTRY, eventId: 5106 });
      expect(await rowsFor(5106)).toBe(3);

      // Once one of them is confirmed, the rule applies.
      await vault.confirm(third.participantId, nextToken++, "6".repeat(64));
      await expect(vault.submit({ ...ENTRY, eventId: 5106 })).rejects.toThrow(AlreadyEnteredError);
    });

    it("stores a keyed index that reveals neither the number nor the race", async () => {
      const r = await vault.submit({ ...ENTRY, eventId: 5107 });
      const { rows } = await pool.query<{ identity_index: Buffer }>(
        "SELECT identity_index FROM participants WHERE id = $1",
        [r.participantId],
      );
      const stored = rows[0]?.identity_index as Buffer;

      expect(stored).toHaveLength(32);
      expect(stored.includes(Buffer.from(PERSON.nationalId, "utf8"))).toBe(false);
      expect(stored.equals(identityIndex(indexKey, 5107, PERSON.nationalId))).toBe(true);
      // Same person, another race: unrelated bytes.
      expect(stored.equals(identityIndex(indexKey, 5108, PERSON.nationalId))).toBe(false);
    });

    it("does not block on a confirmed row from before migration 011, which has no index", async () => {
      // The honest limit: computing an index for an old row needs its decrypted
      // number, so such rows are invisible to the check rather than guessed at.
      const old = await enterAndConfirm({ ...ENTRY, eventId: 5109 });
      await pool.query("UPDATE participants SET identity_index = NULL WHERE id = $1", [
        old.participantId,
      ]);
      await expect(vault.submit({ ...ENTRY, eventId: 5109 })).resolves.toBeDefined();
    });

    it("refuses an index that is not 32 bytes at the database", async () => {
      const r = await vault.submit({ ...ENTRY, eventId: 5110 });
      await expect(
        pool.query("UPDATE participants SET identity_index = $1 WHERE id = $2", [
          Buffer.from(PERSON.nationalId, "utf8"),
          r.participantId,
        ]),
      ).rejects.toThrow(/identity_index_is_a_sha256_hmac/);
    });
  });
});
