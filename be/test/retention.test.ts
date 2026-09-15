/**
 * STE-50 — entries that were submitted and never paid for are deleted after a
 * day, and nothing else is.
 *
 * The tests that matter most are the two races with confirm, run against a real
 * Postgres with a second connection holding a row lock, because "one statement
 * is atomic" is a claim about Postgres's locking that only Postgres can confirm.
 */
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Keyring } from "../src/crypto/keyring.js";
import { startUnconfirmedSweep } from "../src/retention.js";
import { ParticipantNotFoundError, Vault } from "../src/vault.js";
import { DATABASE_URL, SKIP_REASON, freshDatabase } from "./helpers/db.js";

const RUNNER = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";
let nextId = 0;
/** A new person per entry, so STE-51's one-entry rule never interferes. */
const entry = (eventId: number) => ({
  name: "Budi Santoso",
  nationalId: `50${String(nextId++).padStart(14, "0")}`,
  emergencyContact: "+6281234567890",
  idType: "national_id_card" as const,
  bibName: "BUDI",
  email: "budi@example.com",
  phone: "+6281398765432",
  gender: "male" as const,
  dateOfBirth: "1990-05-17",
  emergencyContactName: "Siti Rahayu",
  eventId,
  categoryId: 0,
  runnerAddress: RUNNER,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!DATABASE_URL)(`unconfirmed entry sweep (${DATABASE_URL ? "postgres" : SKIP_REASON})`, () => {
  let pool: Pool;
  let keyring: Keyring;
  let indexKey: Buffer;
  let close: () => Promise<void>;
  let vault: Vault;
  let nextToken = 50_000;

  beforeAll(async () => {
    ({ pool, keyring, indexKey, close } = await freshDatabase());
    vault = new Vault(pool, keyring, indexKey);
  });
  afterAll(async () => close?.());

  /** Submit, then pretend it was submitted `hours` ago. */
  const submitAged = async (eventId: number, hours: number) => {
    const r = await vault.submit(entry(eventId));
    await pool.query(
      "UPDATE participants SET created_at = now() - make_interval(hours => $2) WHERE id = $1",
      [r.participantId, hours],
    );
    return r.participantId;
  };
  const exists = async (id: string) =>
    ((await pool.query("SELECT 1 FROM participants WHERE id = $1", [id])).rowCount ?? 0) === 1;
  /** Every other test's rows are already older than a day; start each from none. */
  const clearOld = () => vault.sweepUnconfirmed(1);

  it("deletes an unconfirmed entry older than 24 hours, and says how many", async () => {
    await clearOld();
    const a = await submitAged(5000, 25);
    const b = await submitAged(5000, 72);

    expect(await vault.sweepUnconfirmed(24)).toBe(2);
    expect(await exists(a)).toBe(false);
    expect(await exists(b)).toBe(false);
  });

  it("keeps an unconfirmed entry younger than 24 hours — the runner may still be paying", async () => {
    await clearOld();
    const young = await submitAged(5001, 23);
    const fresh = (await vault.submit(entry(5001))).participantId;

    expect(await vault.sweepUnconfirmed(24)).toBe(0);
    expect(await exists(young)).toBe(true);
    expect(await exists(fresh)).toBe(true);
  });

  it("never deletes a confirmed entry, however old", async () => {
    await clearOld();
    const id = await submitAged(5002, 24 * 365);
    await vault.confirm(id, nextToken++, "a".repeat(64));

    expect(await vault.sweepUnconfirmed(24)).toBe(0);
    expect(await exists(id)).toBe(true);
  });

  it("is idempotent: a second sweep, or a second API instance, finds nothing", async () => {
    await clearOld();
    await submitAged(5003, 30);
    expect(await vault.sweepUnconfirmed(24)).toBe(1);
    expect(await vault.sweepUnconfirmed(24)).toBe(0);
  });

  it("refuses a window under an hour, which would delete entries mid-payment", async () => {
    await expect(vault.sweepUnconfirmed(0)).rejects.toThrow(RangeError);
    await expect(vault.sweepUnconfirmed(-24)).rejects.toThrow(RangeError);
    await expect(vault.sweepUnconfirmed(0.5)).rejects.toThrow(RangeError);
  });

  describe("racing a confirm", () => {
    it("does not delete an entry whose confirm commits while the sweep waits on it", async () => {
      await clearOld();
      const id = await submitAged(5010, 30);

      // The confirm holds the row lock, uncommitted, the way a slow request would.
      const confirmer = await pool.connect();
      try {
        await confirmer.query("BEGIN");
        await confirmer.query(
          `UPDATE participants SET token_id = $2, enter_tx_hash = $3, confirmed_at = now()
            WHERE id = $1 AND token_id IS NULL`,
          [id, nextToken++, "b".repeat(64)],
        );

        let settled = false;
        const sweep = vault.sweepUnconfirmed(24).finally(() => {
          settled = true;
        });
        await sleep(300);
        // Proves the sweep really is waiting on this row, not finished early.
        expect(settled).toBe(false);

        await confirmer.query("COMMIT");
        // Postgres re-checked `token_id IS NULL` after the lock was released.
        expect(await sweep).toBe(0);
      } finally {
        confirmer.release();
      }

      const { rows } = await pool.query<{ token_id: number | null }>(
        "SELECT token_id FROM participants WHERE id = $1",
        [id],
      );
      expect(rows[0]?.token_id).not.toBeNull();
    });

    it("makes a confirm that loses the race fail loudly instead of reporting success", async () => {
      // The bug this ticket would otherwise have introduced: confirm used to
      // SELECT the row, then UPDATE it. A sweep deleting it in between left the
      // UPDATE touching nothing while confirm returned success.
      await clearOld();
      const id = await submitAged(5011, 30);

      const sweeper = await pool.connect();
      try {
        await sweeper.query("BEGIN");
        await sweeper.query("DELETE FROM participants WHERE id = $1 AND token_id IS NULL", [id]);

        let settled = false;
        const confirm = vault.confirm(id, nextToken++, "c".repeat(64)).finally(() => {
          settled = true;
        });
        // Confirm cannot see the delete yet, so it reaches the UPDATE and waits.
        await sleep(300);
        expect(settled).toBe(false);

        await sweeper.query("COMMIT");
        await expect(confirm).rejects.toBeInstanceOf(ParticipantNotFoundError);
      } finally {
        sweeper.release();
      }
    });

    it("still lets a confirm that arrives first win, with the row kept", async () => {
      await clearOld();
      const id = await submitAged(5012, 30);
      const token = nextToken++;
      await vault.confirm(id, token, "d".repeat(64));
      expect(await vault.sweepUnconfirmed(24)).toBe(0);
      // And the retry after a dropped response is still a success.
      await expect(vault.confirm(id, token, "d".repeat(64))).resolves.toMatchObject({ tokenId: token });
    });
  });
});

describe("startUnconfirmedSweep", () => {
  const logger = () => ({ info: vi.fn(), error: vi.fn() });

  it("sweeps once immediately, then on the interval, logging counts and no rows", async () => {
    vi.useFakeTimers();
    try {
      const sweepUnconfirmed = vi.fn().mockResolvedValue(3);
      const log = logger();
      const stop = startUnconfirmedSweep({ sweepUnconfirmed }, log, {
        olderThanHours: 24,
        intervalMs: 1000,
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(sweepUnconfirmed).toHaveBeenCalledTimes(1);
      expect(sweepUnconfirmed).toHaveBeenCalledWith(24);
      expect(log.info).toHaveBeenCalledWith({ removed: 3, olderThanHours: 24 }, "swept unconfirmed entries");

      await vi.advanceTimersByTimeAsync(2000);
      expect(sweepUnconfirmed).toHaveBeenCalledTimes(3);

      stop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(sweepUnconfirmed).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("logs a failed sweep and keeps going, rather than taking the API down", async () => {
    vi.useFakeTimers();
    try {
      const sweepUnconfirmed = vi
        .fn()
        .mockRejectedValueOnce(new Error("connection terminated"))
        .mockResolvedValue(0);
      const log = logger();
      const stop = startUnconfirmedSweep({ sweepUnconfirmed }, log, {
        olderThanHours: 24,
        intervalMs: 1000,
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(log.error).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(log.info).toHaveBeenCalledWith({ removed: 0, olderThanHours: 24 }, "swept unconfirmed entries");
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not start a second sweep while one is still running", async () => {
    vi.useFakeTimers();
    try {
      let finish: (n: number) => void = () => {};
      const sweepUnconfirmed = vi.fn(
        () => new Promise<number>((resolve) => {
          finish = resolve;
        }),
      );
      const stop = startUnconfirmedSweep({ sweepUnconfirmed }, logger(), {
        olderThanHours: 24,
        intervalMs: 1000,
      });

      await vi.advanceTimersByTimeAsync(5000);
      expect(sweepUnconfirmed).toHaveBeenCalledTimes(1);
      finish(0);
      await vi.advanceTimersByTimeAsync(1000);
      expect(sweepUnconfirmed).toHaveBeenCalledTimes(2);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
