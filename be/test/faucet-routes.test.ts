/**
 * STE-49 — the web app's "Get test sUSD" route, against a real Postgres.
 *
 * The network is replaced by a fake payer, because what is under test here is
 * not Stellar but the rules around it: testnet only, one payout per address
 * per window, a daily cap, clear errors, and — the one that matters most — two
 * requests arriving together are paid once.
 */
import { Keypair, Networks } from "@stellar/stellar-sdk";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChallengeStore } from "../src/auth.js";
import { loadConfig } from "../src/config.js";
import type { FaucetPayer } from "../src/faucet.js";
import { buildServer } from "../src/server.js";
import { DATABASE_URL, SKIP_REASON, freshDatabase } from "./helpers/db.js";

const AMOUNT = 500_000_000n; // 50 sUSD

/** Records every payment; each behaviour can be switched per test. */
class FakePayer implements FaucetPayer {
  readonly address = Keypair.random().publicKey();
  paid: { to: string; stroops: bigint }[] = [];
  status: "ready" | "no-account" | "no-trustline" = "ready";
  float = 10_000n * AMOUNT;
  failWith: string | null = null;
  /** Held open so two requests can overlap inside the payment. */
  delayMs = 0;

  async recipientStatus(): Promise<"ready" | "no-account" | "no-trustline"> {
    return this.status;
  }
  async balance(): Promise<bigint> {
    return this.float;
  }
  async pay(to: string, stroops: bigint): Promise<string> {
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.failWith) throw new Error(`transaction failed: ${this.failWith}`);
    this.paid.push({ to, stroops });
    this.float -= stroops;
    return "ab".repeat(32);
  }
}

describe.skipIf(!DATABASE_URL)(`faucet route (${DATABASE_URL ? "postgres" : SKIP_REASON})`, () => {
  let pool: Pool;
  let close: () => Promise<void>;
  let app: FastifyInstance;
  let payer: FakePayer;

  const start = async (env: Record<string, string> = {}, withPayer = true) => {
    await app?.close();
    app = buildServer(loadConfig({ NODE_ENV: "test", FAUCET_AMOUNT_STROOPS: AMOUNT.toString(), ...env }), {
      pool,
      challenges: new ChallengeStore(),
      ...(withPayer ? { faucetPayer: payer } : {}),
    });
    await app.ready();
  };

  beforeEach(async () => {
    ({ pool, close } = await freshDatabase());
    payer = new FakePayer();
    await start();
  });

  afterEach(async () => {
    await app?.close();
    await close();
  });

  async function credentials(kp: Keypair): Promise<Record<string, string>> {
    const { nonce } = (
      await app.inject({ method: "POST", url: "/auth/challenge", payload: { address: kp.publicKey() } })
    ).json();
    return {
      "x-sterun-address": kp.publicKey(),
      "x-sterun-nonce": nonce,
      "x-sterun-signature": Buffer.from(kp.sign(Buffer.from(nonce, "utf8"))).toString("base64"),
    };
  }

  const claim = async (kp: Keypair) =>
    app.inject({ method: "POST", url: "/faucet", headers: await credentials(kp) });

  describe("positive", () => {
    it("pays the authenticated address the configured amount, once", async () => {
      const runner = Keypair.random();
      const res = await claim(runner);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        address: runner.publicKey(),
        paid_stroops: "500000000",
        tx_hash: "ab".repeat(32),
      });
      expect(Date.parse(res.json().next_claim_at)).toBeGreaterThan(Date.now());
      expect(payer.paid).toEqual([{ to: runner.publicKey(), stroops: AMOUNT }]);
    });

    it("records the payout as paid, naming its transaction", async () => {
      await claim(Keypair.random());
      const { rows } = await pool.query("SELECT status, tx_hash FROM faucet_payouts");
      expect(rows).toEqual([{ status: "paid", tx_hash: "ab".repeat(32) }]);
    });

    it("reports itself available in /config, with its limits", async () => {
      const body = (await app.inject({ url: "/config" })).json();
      expect(body.faucet.route).toMatchObject({ available: true, reason: null, windowHours: 24 });
    });
  });

  describe("negative", () => {
    it("tells a wallet with no trustline to add one, and pays nothing", async () => {
      payer.status = "no-trustline";
      const res = await claim(Keypair.random());
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: "no-trustline" });
      expect(res.json().message).toMatch(/add the sUSD trustline/);
      expect(payer.paid).toEqual([]);
    });

    it("tells a wallet whose account does not exist yet what to do first", async () => {
      payer.status = "no-account";
      const res = await claim(Keypair.random());
      expect(res.json()).toMatchObject({ error: "no-trustline" });
      expect(res.json().message).toMatch(/fund it with test XLM/);
    });

    it("refuses a second request inside the window, and says when to come back", async () => {
      const runner = Keypair.random();
      await claim(runner);
      const second = await claim(runner);

      expect(second.statusCode).toBe(429);
      expect(second.json().error).toBe("rate-limited");
      const retryAt = Date.parse(second.json().retry_at);
      expect(retryAt).toBeGreaterThan(Date.now() + 23 * 3_600_000);
      expect(Number(second.headers["retry-after"])).toBeGreaterThan(23 * 3600);
      expect(payer.paid).toHaveLength(1);
    });

    it("refuses on a network that is not testnet, even with a faucet key", async () => {
      await start({ STELLAR_NETWORK_PASSPHRASE: Networks.PUBLIC });
      const res = await claim(Keypair.random());
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: "faucet-unavailable" });
      expect(payer.paid).toEqual([]);
      expect((await app.inject({ url: "/config" })).json().faucet.route).toMatchObject({
        available: false,
        reason: expect.stringMatching(/testnet/),
      });
    });

    it("says it is not configured, rather than 404, when there is no faucet key", async () => {
      await start({}, false);
      const res = await claim(Keypair.random());
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({ error: "faucet-unavailable" });
    });

    it("refuses an unauthenticated call", async () => {
      const res = await app.inject({ method: "POST", url: "/faucet" });
      expect(res.statusCode).toBe(401);
      expect(payer.paid).toEqual([]);
    });

    it("says the faucet is empty when the float cannot cover a payout", async () => {
      payer.float = AMOUNT - 1n;
      const runner = Keypair.random();
      const res = await claim(runner);
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({ error: "faucet-empty" });

      // Checked before reserving, so the runner has not lost their window.
      payer.float = 10n * AMOUNT;
      expect((await claim(runner)).statusCode).toBe(200);
    });

    it("stops at the daily cap across different addresses", async () => {
      await start({ FAUCET_DAILY_CAP_STROOPS: (2n * AMOUNT).toString() });
      expect((await claim(Keypair.random())).statusCode).toBe(200);
      expect((await claim(Keypair.random())).statusCode).toBe(200);

      const third = await claim(Keypair.random());
      expect(third.statusCode).toBe(429);
      expect(third.json().message).toMatch(/today's limit/);
      expect(payer.paid).toHaveLength(2);
    });
  });

  describe("edge", () => {
    it("pays two concurrent requests for one address exactly once", async () => {
      // The payment is held open so the second request arrives while the first
      // is still paying. Without the pending row written before the payment,
      // both would pass the window check and both would be paid.
      payer.delayMs = 150;
      const runner = Keypair.random();
      const [a, b] = await Promise.all([credentials(runner), credentials(runner)]);
      const results = await Promise.all([
        app.inject({ method: "POST", url: "/faucet", headers: a }),
        app.inject({ method: "POST", url: "/faucet", headers: b }),
      ]);

      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 429]);
      expect(payer.paid).toHaveLength(1);
    });

    it("releases the window when the payment itself fails, so the runner can retry", async () => {
      const runner = Keypair.random();
      payer.failWith = '{"transaction":"tx_failed","operations":["op_no_trust"]}';
      const failed = await claim(runner);
      expect(failed.statusCode).toBe(409);
      expect(failed.json().error).toBe("no-trustline");

      payer.failWith = null;
      expect((await claim(runner)).statusCode).toBe(200);
      const { rows } = await pool.query("SELECT status FROM faucet_payouts ORDER BY id");
      expect(rows.map((r) => r.status)).toEqual(["failed", "paid"]);
    });

    it("maps an underfunded payment to faucet-empty", async () => {
      payer.failWith = '{"operations":["op_underfunded"]}';
      const res = await claim(Keypair.random());
      expect(res.statusCode).toBe(503);
      expect(res.json().error).toBe("faucet-empty");
    });
  });
});

/**
 * The claim ledger on its own, where the advisory lock is what is under test.
 *
 * The route-level concurrency test above cannot see the lock: its payment delay
 * sits after the claim commits, so the second request only reaches its claim
 * once the first `pending` row is visible. What the lock guards is narrower —
 * two claims overlapping INSIDE the transaction, between the window check and
 * the insert — and the only way to provoke that is many claims at once.
 *
 * Checked by removing the lock: the daily-cap test below overshot on every run
 * (5, 9 and 8 claims granted against a cap of 3), while the same-address test
 * failed in only one run of three. A race is probabilistic, so the cap test is
 * the one that reliably notices a missing lock; keep both, trust that one.
 */
describe.skipIf(!DATABASE_URL)(`faucet claim ledger (${DATABASE_URL ? "postgres" : SKIP_REASON})`, () => {
  let pool: Pool;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ({ pool, close } = await freshDatabase());
  });
  afterEach(async () => {
    await close();
  });

  const request = (address: string, dailyCapStroops = 1_000_000n * AMOUNT) => ({
    address,
    amountStroops: AMOUNT,
    windowHours: 24,
    dailyCapStroops,
  });

  it("grants exactly one of many simultaneous claims for one address", async () => {
    const { claimPayout } = await import("../src/faucet.js");
    const address = Keypair.random().publicKey();
    const outcomes = await Promise.all(
      Array.from({ length: 25 }, () => claimPayout(pool, request(address))),
    );
    expect(outcomes.filter((o) => o.kind === "claimed")).toHaveLength(1);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM faucet_payouts");
    expect(rows[0]?.n).toBe(1);
  });

  it("never lets simultaneous claims from different addresses overshoot the daily cap", async () => {
    const { claimPayout } = await import("../src/faucet.js");
    const outcomes = await Promise.all(
      Array.from({ length: 25 }, () => claimPayout(pool, request(Keypair.random().publicKey(), 3n * AMOUNT))),
    );
    expect(outcomes.filter((o) => o.kind === "claimed")).toHaveLength(3);
  });
});
