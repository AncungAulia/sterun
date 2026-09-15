/**
 * STE-11 (C7) — the PII vault.
 *
 * The product rule this module enforces: **PII goes in and never comes out.**
 * There is no read method on this class that returns a name, a national id or a
 * contact number, and that is not an oversight to be filled in later — nothing
 * in the Sterun design needs to read them back. What downstream needs is the
 * hash (on-chain), the TOTP secret (roster bundles, STE-16) and the link
 * between a vault row and a token id. Those are what this exposes.
 *
 * `decryptForAudit` is the single exception and is named to be uncomfortable.
 * It exists because "we encrypted it and threw away the ability to check" is
 * not a testable claim — the round-trip test needs it, and a future
 * subject-access request would too. It is never reachable from an HTTP route.
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { identityIndex } from "./crypto/blind-index.js";
import { aad, decrypt, encrypt } from "./crypto/envelope.js";
import type { Keyring } from "./crypto/keyring.js";
import { nameFragment } from "./roster/name-fragment.js";
import {
  participantHash,
  generateSalt,
  type ParticipantInput,
} from "./spec/participant-hash.js";
import { generateTotpSecret } from "./spec/totp.js";

/** Which kind of identity document `nationalId` holds (STE-47). Not PII. */
export type IdType = "national_id_card" | "passport" | "driving_licence" | "other";

/** For podium categories (STE-47). */
export type Gender = "female" | "male";

/**
 * What the entry form collects beyond the three hashed fields (STE-47).
 *
 * None of it is part of `participant_hash`. Everything but `idType` and
 * `bibName` is encrypted; see migration 009 for why those two are not.
 */
export interface EntryFormFields {
  idType: IdType;
  /** Printed on the bib. 1 to 16 characters. */
  bibName: string;
  email: string;
  /** E.164, e.g. `+6281234567890`. */
  phone: string;
  gender: Gender;
  /** `YYYY-MM-DD`. A date, never an age: a record is permanent and an age is not. */
  dateOfBirth: string;
  emergencyContactName: string;
}

/**
 * Everything the audit path can decrypt. The STE-47 fields are `null` for rows
 * written before migration 009, which never had them.
 */
export interface AuditedParticipant extends ParticipantInput {
  idType: IdType | null;
  bibName: string | null;
  email: string | null;
  phone: string | null;
  gender: Gender | null;
  dateOfBirth: string | null;
  emergencyContactName: string | null;
}

export interface SubmitParticipant extends ParticipantInput, EntryFormFields {
  eventId: number;
  categoryId: number;
  runnerAddress: string;
  /**
   * What the runner picked from the race pack, naming items the way the event
   * document does. Not PII, and stored in the clear on purpose (migration 005)
   * because the organiser has to count it to place the order. Absent is the
   * same as an empty list.
   */
  addOns?: AddOnChoice[];
}

/**
 * What the runner is told, once.
 *
 * The salt and the TOTP secret are shown exactly once and are not retrievable
 * afterwards: the salt so the runner can prove their own record later without
 * depending on us being alive, the secret because their pass needs it offline.
 * Both stay server-side too — the roster bundle needs the secret at race time.
 */
export interface SubmitResult {
  participantId: string;
  participantHash: string;
  saltHex: string;
  totpSecretHex: string;
}

export interface ConfirmResult {
  participantId: string;
  tokenId: number;
  enterTxHash: string;
}

/** Everything about a row that is safe to hand to a caller. No PII. */
export interface ParticipantSummary {
  participantId: string;
  participantHash: string;
  eventId: number;
  categoryId: number;
  runnerAddress: string;
  tokenId: number | null;
  confirmedAt: Date | null;
  createdAt: Date;
}

/**
 * One roster row's worth of vault material. No name, no id, no contact — see
 * {@link Vault.rosterSecretsForEvent}.
 */
/** One thing a runner chose, and what they chose for it. */
export interface AddOnChoice {
  /** Matches an item name in the event document's `add_ons`. */
  item: string;
  /** "L", "One size", whatever the organiser offered. */
  choice: string;
}

export interface RosterSecret {
  tokenId: number;
  /** 64 lowercase hex characters. The scanner recomputes TOTP codes with it. */
  totpSecretHex: string;
  /** Given name plus initials, or `null` for rows predating migration 003. */
  nameFragment: string | null;
  /**
   * What this runner picked from the race pack. Empty when the race hands out
   * nothing that has to be chosen.
   */
  addOns: AddOnChoice[];
}

export class ParticipantExistsError extends Error {
  constructor(readonly tokenId: number) {
    super(`token_id ${tokenId} is already linked to a different participant record`);
    this.name = "ParticipantExistsError";
  }
}

export class ParticipantNotFoundError extends Error {
  constructor(id: string) {
    super(`no participant record ${id}`);
    this.name = "ParticipantNotFoundError";
  }
}

export class AlreadyConfirmedError extends Error {
  constructor(readonly tokenId: number) {
    super(`already confirmed as token_id ${tokenId}`);
    this.name = "AlreadyConfirmedError";
  }
}

/**
 * The same identity number already has a confirmed entry in this race (STE-51).
 * Says which race and nothing about the person or the other entry.
 */
export class AlreadyEnteredError extends Error {
  constructor(readonly eventId: number) {
    super(
      "this identity number already has an entry in this race; one person can enter one " +
        "category of a race",
    );
    this.name = "AlreadyEnteredError";
  }
}

export class Vault {
  constructor(
    private readonly pool: Pool,
    private readonly keyring: Keyring,
    /** PII_INDEX_KEY. See src/crypto/blind-index.ts. */
    private readonly indexKey: Buffer,
  ) {}

  /**
   * Store one entry's PII and mint everything derived from it.
   *
   * The id is generated here rather than by the database because it is the AAD
   * that binds each ciphertext to this row — it has to exist before the values
   * are encrypted.
   */
  async submit(input: SubmitParticipant): Promise<SubmitResult> {
    const id = randomUUID();
    const salt = generateSalt();
    const totpSecret = generateTotpSecret();

    // Hashed before anything is written. A normalisation refusal (blank name,
    // an id that is only separators) must fail the request, not leave a row.
    const hash = participantHash(input, salt);
    // Reduced here, where the plaintext already is, so nothing downstream ever
    // needs a "decrypt the name" path to build a roster (STE-16).
    const fragment = nameFragment(input.name);

    // STE-51: one person, one entry per race. Only a CONFIRMED entry refuses:
    // an unconfirmed row is a payment that has not happened yet, and a runner
    // retrying after a declined payment must not be locked out by their own
    // first attempt.
    //
    // Checked here, at submit, and not enforced at confirm: confirm runs after
    // the runner has paid on chain, and refusing then would leave a paid record
    // with no vault row and no pass. The cost is a narrow window — two entries
    // whose payments overlap both get through — which only the contract could
    // close, and the contract only ever sees a salted hash.
    const identity = identityIndex(this.indexKey, input.eventId, input.nationalId);
    const taken = await this.pool.query(
      "SELECT 1 FROM participants WHERE identity_index = $1 AND token_id IS NOT NULL LIMIT 1",
      [identity],
    );
    if ((taken.rowCount ?? 0) > 0) throw new AlreadyEnteredError(input.eventId);

    await this.pool.query(
      `INSERT INTO participants
         (id, name_enc, national_id_enc, emergency_contact_enc, name_fragment_enc,
          salt, totp_secret, participant_hash, event_id, category_id, runner_address,
          add_ons, id_type, bib_name, email_enc, phone_enc, gender_enc,
          date_of_birth_enc, emergency_contact_name_enc, identity_index)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        id,
        encrypt(this.keyring, input.name, aad("pii.name", id)),
        encrypt(this.keyring, input.nationalId, aad("pii.national_id", id)),
        encrypt(this.keyring, input.emergencyContact, aad("pii.emergency_contact", id)),
        encrypt(this.keyring, fragment, aad("pii.name_fragment", id)),
        salt,
        totpSecret,
        Buffer.from(hash, "hex"),
        input.eventId,
        input.categoryId,
        input.runnerAddress,
        // Serialised here rather than passed as an object, so what reaches the
        // column is exactly what this code decided and never whatever the pg
        // driver would infer from a bare object.
        JSON.stringify(input.addOns ?? []),
        // STE-47. Same envelope and same per-row AAD pattern as the columns
        // above, so a ciphertext cannot be moved to another row or column.
        input.idType,
        input.bibName,
        encrypt(this.keyring, input.email, aad("pii.email", id)),
        encrypt(this.keyring, input.phone, aad("pii.phone", id)),
        encrypt(this.keyring, input.gender, aad("pii.gender", id)),
        encrypt(this.keyring, input.dateOfBirth, aad("pii.date_of_birth", id)),
        encrypt(this.keyring, input.emergencyContactName, aad("pii.emergency_contact_name", id)),
        identity,
      ],
    );

    return {
      participantId: id,
      participantHash: hash,
      saltHex: salt.toString("hex"),
      totpSecretHex: totpSecret.toString("hex"),
    };
  }

  /**
   * Link a vault row to the on-chain record `enter` just minted.
   *
   * Idempotent in the only way that is safe: confirming the same row with the
   * same token id again succeeds, and confirming it with a *different* one is
   * an error. A retry after a dropped response must not be a failure, and a
   * second entry quietly overwriting the first must not be a success.
   */
  async confirm(participantId: string, tokenId: number, enterTxHash: string): Promise<ConfirmResult> {
    // One conditional UPDATE first, and only then a look at why it did nothing.
    //
    // This used to SELECT and then UPDATE `WHERE id = $1`. Since STE-50 a sweep
    // deletes old unconfirmed rows, and one landing between those two statements
    // made the UPDATE touch zero rows while confirm still returned success: a
    // runner told they were confirmed, with no row behind it. `AND token_id IS
    // NULL` also stops two concurrent confirms re-pointing one row. Postgres
    // re-checks both conditions after waiting on a row lock, so whichever of
    // confirm and sweep commits first, the other sees the result.
    let updated;
    try {
      updated = await this.pool.query(
        `UPDATE participants
            SET token_id = $2, enter_tx_hash = $3, confirmed_at = now()
          WHERE id = $1 AND token_id IS NULL`,
        [participantId, tokenId, enterTxHash],
      );
    } catch (e) {
      // The partial unique index on token_id. Two rows claiming one on-chain
      // record would mean two people claiming one bib.
      if ((e as { code?: string }).code === "23505") throw new ParticipantExistsError(tokenId);
      throw e;
    }
    if ((updated.rowCount ?? 0) === 1) return { participantId, tokenId, enterTxHash };

    const existing = await this.pool.query<{ token_id: number | null }>(
      "SELECT token_id FROM participants WHERE id = $1",
      [participantId],
    );
    const row = existing.rows[0];
    // Never submitted, or swept away as an unconfirmed entry older than the
    // retention window (STE-50).
    if (!row) throw new ParticipantNotFoundError(participantId);
    // A retry after a dropped response is fine; a different token is not.
    if (row.token_id !== tokenId) throw new AlreadyConfirmedError(row.token_id as number);
    return { participantId, tokenId, enterTxHash };
  }

  /**
   * Delete entries that were submitted and never confirmed (STE-50).
   *
   * The entry flow stores the details BEFORE the runner signs `enter`, so a paid
   * runner is never missing from the roster. When the payment never happens,
   * that leaves personal data for an entry that does not exist, and we have no
   * purpose for keeping it (UU PDP). Returns how many rows went, and nothing
   * about them.
   *
   * One statement, so it cannot delete a row a confirm is writing: Postgres
   * re-evaluates `token_id IS NULL` on a row whose lock it had to wait for, and
   * a row confirmed in the meantime no longer matches.
   */
  async sweepUnconfirmed(olderThanHours: number): Promise<number> {
    // Below an hour this would delete entries whose runner is still at the
    // wallet prompt. A misconfigured 0 must not be able to do that.
    if (!Number.isInteger(olderThanHours) || olderThanHours < 1) {
      throw new RangeError(`olderThanHours must be a whole number of hours >= 1, got ${olderThanHours}`);
    }
    const result = await this.pool.query(
      `DELETE FROM participants
        WHERE token_id IS NULL
          AND created_at < now() - make_interval(hours => $1)`,
      [olderThanHours],
    );
    return result.rowCount ?? 0;
  }

  /** Row metadata with no PII in it. Safe to return over HTTP. */
  async summary(participantId: string): Promise<ParticipantSummary | null> {
    const { rows } = await this.pool.query<{
      id: string;
      participant_hash: Buffer;
      event_id: number;
      category_id: number;
      runner_address: string;
      token_id: number | null;
      confirmed_at: Date | null;
      created_at: Date;
    }>(
      `SELECT id, participant_hash, event_id, category_id, runner_address,
              token_id, confirmed_at, created_at
         FROM participants WHERE id = $1`,
      [participantId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      participantId: r.id,
      participantHash: r.participant_hash.toString("hex"),
      eventId: r.event_id,
      categoryId: r.category_id,
      runnerAddress: r.runner_address,
      tokenId: r.token_id,
      confirmedAt: r.confirmed_at,
      createdAt: r.created_at,
    };
  }

  /**
   * The TOTP secret for a confirmed record, for the roster bundle (STE-16).
   *
   * Keyed by token_id rather than participant id because that is what the
   * scanner knows, and restricted to confirmed rows because a record that is
   * not on-chain cannot be checked in.
   */
  async totpSecretForToken(tokenId: number): Promise<Buffer | null> {
    const { rows } = await this.pool.query<{ totp_secret: Buffer }>(
      "SELECT totp_secret FROM participants WHERE token_id = $1",
      [tokenId],
    );
    return rows[0]?.totp_secret ?? null;
  }

  /**
   * The secret material a scanner needs for one event's roster (STE-16).
   *
   * This is the second read path out of the vault, and it stays inside the
   * module's rule for two reasons: what it returns is a check-in secret and a
   * *fragment*, never a name; and it is reachable only from an endpoint that
   * demands a wallet signature from an address the chain lists as a scanner for
   * this event. The blast radius is written down honestly in
   * docs/SYSTEM_DESIGN.md §11 point 3 — a leaked roster lets someone mint valid
   * codes, and the on-chain `state == Entered` guard is what caps the damage.
   *
   * Confirmed rows only: a record that is not on-chain has no token id, and a
   * scanner cannot check in something that was never entered.
   */
  async rosterSecretsForEvent(eventId: number): Promise<RosterSecret[]> {
    const { rows } = await this.pool.query<{
      id: string;
      token_id: number;
      totp_secret: Buffer;
      name_fragment_enc: Buffer | null;
      add_ons: AddOnChoice[] | null;
    }>(
      `SELECT id, token_id, totp_secret, name_fragment_enc, add_ons
         FROM participants
        WHERE event_id = $1 AND token_id IS NOT NULL
        ORDER BY token_id`,
      [eventId],
    );
    return rows.map((r) => ({
      tokenId: r.token_id,
      totpSecretHex: r.totp_secret.toString("hex"),
      // Null only for a row written before migration 005 landed; the column is
      // NOT NULL with a default, so every row written since carries a list.
      addOns: r.add_ons ?? [],
      // Null for rows submitted before migration 003: the fragment can only be
      // derived from the plaintext at submit time, so there is nothing to
      // backfill from. Reporting null is the honest answer.
      nameFragment:
        r.name_fragment_enc === null
          ? null
          : decrypt(this.keyring, r.name_fragment_enc, aad("pii.name_fragment", r.id)),
    }));
  }

  /**
   * Decrypt a row's PII. **Not reachable from any HTTP route** — see the module
   * comment. Present so that "it is encrypted" is a claim a test can check, and
   * so a lawful subject-access request has a defined path instead of an
   * improvised one.
   */
  async decryptForAudit(participantId: string): Promise<AuditedParticipant> {
    const { rows } = await this.pool.query<{
      name_enc: Buffer;
      national_id_enc: Buffer;
      emergency_contact_enc: Buffer;
      id_type: IdType | null;
      bib_name: string | null;
      email_enc: Buffer | null;
      phone_enc: Buffer | null;
      gender_enc: Buffer | null;
      date_of_birth_enc: Buffer | null;
      emergency_contact_name_enc: Buffer | null;
    }>(
      `SELECT name_enc, national_id_enc, emergency_contact_enc, id_type, bib_name, email_enc,
              phone_enc, gender_enc, date_of_birth_enc, emergency_contact_name_enc
         FROM participants WHERE id = $1`,
      [participantId],
    );
    const r = rows[0];
    if (!r) throw new ParticipantNotFoundError(participantId);
    const open = (value: Buffer | null, column: string): string | null =>
      value === null ? null : decrypt(this.keyring, value, aad(column, participantId));
    return {
      idType: r.id_type,
      bibName: r.bib_name,
      email: open(r.email_enc, "pii.email"),
      phone: open(r.phone_enc, "pii.phone"),
      gender: open(r.gender_enc, "pii.gender") as Gender | null,
      dateOfBirth: open(r.date_of_birth_enc, "pii.date_of_birth"),
      emergencyContactName: open(r.emergency_contact_name_enc, "pii.emergency_contact_name"),
      name: decrypt(this.keyring, r.name_enc, aad("pii.name", participantId)),
      nationalId: decrypt(this.keyring, r.national_id_enc, aad("pii.national_id", participantId)),
      emergencyContact: decrypt(
        this.keyring,
        r.emergency_contact_enc,
        aad("pii.emergency_contact", participantId),
      ),
    };
  }
}
