/**
 * STE-31 — nonces in Postgres, so the API can run as more than one process.
 *
 * Kept out of `auth.ts` on purpose: that module is pure Node and has no
 * database import, which is what lets the whole signature-verification path be
 * tested and reasoned about without a Postgres anywhere near it. This file is
 * the twenty lines that know about SQL.
 *
 * ## `DELETE … RETURNING` is the entire point
 *
 * Spending a nonce has to be indivisible. Read-then-delete leaves a window in
 * which two requests both read the same row, and behind a load balancer those
 * two requests are on different machines — so the replay this whole mechanism
 * exists to prevent becomes possible exactly when the deployment grows, which
 * is the worst possible time to discover it.
 *
 * `DELETE … RETURNING` is one statement. Two instances racing on the same nonce
 * produce one returned row between them; the loser gets zero rows and its
 * caller is told the nonce is unknown, which is true.
 */
import type { Pool } from "pg";
import type { Issued, NonceBackend } from "./auth.js";

export class PostgresNonces implements NonceBackend {
  constructor(private readonly pool: Pool) {}

  async put(nonce: string, address: string, expiresAtMs: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth_nonces (nonce, address, expires_at) VALUES ($1, $2, $3)`,
      [nonce, address, new Date(expiresAtMs)],
    );
  }

  async take(nonce: string): Promise<Issued | null> {
    // One statement. See the header.
    const { rows } = await this.pool.query<{ address: string; expires_at: Date }>(
      `DELETE FROM auth_nonces WHERE nonce = $1 RETURNING address, expires_at`,
      [nonce],
    );
    const row = rows[0];
    return row ? { address: row.address, expiresAtMs: row.expires_at.getTime() } : null;
  }

  async sweep(nowMs: number): Promise<void> {
    await this.pool.query(`DELETE FROM auth_nonces WHERE expires_at <= $1`, [new Date(nowMs)]);
  }

  async size(): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM auth_nonces`,
    );
    return Number(rows[0]?.count ?? 0);
  }
}
