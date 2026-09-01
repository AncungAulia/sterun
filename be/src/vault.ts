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
import { aad, decrypt, encrypt } from "./crypto/envelope.js";
import type { Keyring } from "./crypto/keyring.js";
import {
  participantHash,
  generateSalt,
  type ParticipantInput,
} from "./spec/participant-hash.js";
import { generateTotpSecret } from "./spec/totp.js";

export interface SubmitParticipant extends ParticipantInput {
  eventId: number;
  categoryId: number;
  runnerAddress: string;
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

export class Vault {
  constructor(
    private readonly pool: Pool,
    private readonly keyring: Keyring,
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

    await this.pool.query(
      `INSERT INTO participants
         (id, name_enc, national_id_enc, emergency_contact_enc, salt, totp_secret,
          participant_hash, event_id, category_id, runner_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id,
        encrypt(this.keyring, input.name, aad("pii.name", id)),
        encrypt(this.keyring, input.nationalId, aad("pii.national_id", id)),
        encrypt(this.keyring, input.emergencyContact, aad("pii.emergency_contact", id)),
        salt,
        totpSecret,
        Buffer.from(hash, "hex"),
        input.eventId,
        input.categoryId,
        input.runnerAddress,
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
    const existing = await this.pool.query<{ token_id: number | null }>(
      "SELECT token_id FROM participants WHERE id = $1",
      [participantId],
    );
    const row = existing.rows[0];
    if (!row) throw new ParticipantNotFoundError(participantId);
    if (row.token_id !== null) {
      if (row.token_id !== tokenId) throw new AlreadyConfirmedError(row.token_id);
      return { participantId, tokenId, enterTxHash };
    }

    try {
      await this.pool.query(
        `UPDATE participants
            SET token_id = $2, enter_tx_hash = $3, confirmed_at = now()
          WHERE id = $1`,
        [participantId, tokenId, enterTxHash],
      );
    } catch (e) {
      // The partial unique index on token_id. Two rows claiming one on-chain
      // record would mean two people claiming one bib.
      if ((e as { code?: string }).code === "23505") throw new ParticipantExistsError(tokenId);
      throw e;
    }

    return { participantId, tokenId, enterTxHash };
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
   * Decrypt a row's PII. **Not reachable from any HTTP route** — see the module
   * comment. Present so that "it is encrypted" is a claim a test can check, and
   * so a lawful subject-access request has a defined path instead of an
   * improvised one.
   */
  async decryptForAudit(participantId: string): Promise<ParticipantInput> {
    const { rows } = await this.pool.query<{
      name_enc: Buffer;
      national_id_enc: Buffer;
      emergency_contact_enc: Buffer;
    }>(
      "SELECT name_enc, national_id_enc, emergency_contact_enc FROM participants WHERE id = $1",
      [participantId],
    );
    const r = rows[0];
    if (!r) throw new ParticipantNotFoundError(participantId);
    return {
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
