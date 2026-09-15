/**
 * STE-52 — restoring a pass: a record's check-in secret, to the wallet that owns
 * the record, and to nobody else.
 *
 * Most of this file is refusals, because the route hands out a secret. The
 * positive path checks the one property that makes the feature worth having:
 * the secret a phone gets back is the same one the scanner's roster carries, so
 * the codes it shows are the codes the desk accepts.
 */
import { Keypair } from "@stellar/stellar-sdk";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChallengeStore } from "../src/auth.js";
import { ChainReader } from "../src/chain/reader.js";
import { loadConfig } from "../src/config.js";
import type { Keyring } from "../src/crypto/keyring.js";
import { Indexer } from "../src/indexer/indexer.js";
import { buildServer } from "../src/server.js";
import { Vault } from "../src/vault.js";
import { ADDRESSES } from "./helpers/addresses.js";
import { FakeChain } from "./helpers/fake-chain.js";
import { FakeEventSource } from "./helpers/fake-events.js";
import { DATABASE_URL, SKIP_REASON, freshDatabase } from "./helpers/db.js";

const organiser = Keypair.random();
const runner = Keypair.random();
const other = Keypair.random();

let nextId = 0;
const entry = (address: string, bibName = "BUDI") => ({
  name: "Budi Santoso",
  nationalId: `52${String(nextId++).padStart(14, "0")}`,
  emergencyContact: "+6281234567890",
  idType: "national_id_card" as const,
  bibName,
  email: "budi@example.com",
  phone: "+6281398765432",
  gender: "male" as const,
  dateOfBirth: "1990-05-17",
  emergencyContactName: "Siti Rahayu",
  eventId: 0,
  categoryId: 0,
  runnerAddress: address,
});

describe.skipIf(!DATABASE_URL)(`restoring a pass (${DATABASE_URL ? "postgres" : SKIP_REASON})`, () => {
  let pool: Pool;
  let keyring: Keyring;
  let indexKey: Buffer;
  let close: () => Promise<void>;
  let app: FastifyInstance;
  let vault: Vault;
  let chain: FakeChain;
  let reader: ChainReader;

  beforeEach(async () => {
    ({ pool, keyring, indexKey, close } = await freshDatabase());
    chain = new FakeChain(ADDRESSES);
    reader = new ChainReader(chain, ADDRESSES);
    vault = new Vault(pool, keyring, indexKey);

    chain.addEvent({ eventId: 0, organiser: organiser.publicKey() });
    chain.addCategory({ eventId: 0, categoryId: 0 });
    chain.addRecord({ tokenId: 0, eventId: 0, owner: runner.publicKey(), bibNo: 1 });
    chain.addRecord({ tokenId: 1, eventId: 0, owner: other.publicKey(), bibNo: 2 });

    app = buildServer(loadConfig({ NODE_ENV: "test" }), {
      pool,
      vault,
      reader,
      challenges: new ChallengeStore(),
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
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

  const enter = async (kp: Keypair, tokenId: number, bibName?: string) => {
    const submitted = await vault.submit(entry(kp.publicKey(), bibName));
    await vault.confirm(submitted.participantId, tokenId, "ab".repeat(32));
    return submitted;
  };

  const fetchPass = async (tokenId: number, kp: Keypair) =>
    app.inject({ method: "GET", url: `/records/${tokenId}/pass`, headers: await credentials(kp) });

  it("gives the owner their secret and bib name back", async () => {
    const submitted = await enter(runner, 0, "BUDI S");

    const res = await fetchPass(0, runner);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      token_id: 0,
      totp_secret: submitted.totpSecretHex,
      bib_name: "BUDI S",
    });
  });

  it("gives back the same secret the scanner roster carries for that token", async () => {
    const submitted = await enter(runner, 0);
    await new Indexer(pool, reader, new FakeEventSource([]), ADDRESSES).rebuild();

    const pass = (await fetchPass(0, runner)).json();
    const roster = (
      await app.inject({
        method: "GET",
        url: "/events/0/roster",
        headers: await credentials(organiser),
      })
    ).json();
    const line = roster.entries.find((e: { token_id: number }) => e.token_id === 0);

    expect(line.totp_secret).toBe(pass.totp_secret);
    expect(pass.totp_secret).toBe(submitted.totpSecretHex);
  });

  it("403s another wallet, without reading or revealing anything from the vault", async () => {
    const submitted = await enter(runner, 0);

    const res = await fetchPass(0, other);

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("forbidden");
    expect(res.body).not.toContain(submitted.totpSecretHex);
  });

  it("404s `no-pass` for a record whose entry was submitted but never confirmed", async () => {
    await vault.submit(entry(runner.publicKey()));

    const res = await fetchPass(0, runner);

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("no-pass");
  });

  it("404s `no-pass` for a record with no entry details at all", async () => {
    const res = await fetchPass(0, runner);
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("no-pass");
  });

  it("404s a token that does not exist on chain", async () => {
    const res = await fetchPass(999, runner);
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("not-found");
  });

  it("does not hand out a row that another wallet confirmed against this token", async () => {
    // Confirm takes the token id from the client. A row submitted by `other`
    // and pointed at the runner's token must not become the runner's pass,
    // and must certainly not reach `other`, who does not own the record.
    const hijack = await vault.submit(entry(other.publicKey()));
    await vault.confirm(hijack.participantId, 0, "cd".repeat(32));

    const asOwner = await fetchPass(0, runner);
    expect(asOwner.statusCode).toBe(404);
    expect(asOwner.body).not.toContain(hijack.totpSecretHex);

    const asOther = await fetchPass(0, other);
    expect(asOther.statusCode).toBe(403);
    expect(asOther.body).not.toContain(hijack.totpSecretHex);
  });

  it("returns bib_name null for an entry made before the entry form had one", async () => {
    const submitted = await enter(runner, 0);
    await pool.query("UPDATE participants SET bib_name = NULL WHERE id = $1", [submitted.participantId]);

    const res = await fetchPass(0, runner);
    expect(res.statusCode).toBe(200);
    expect(res.json().bib_name).toBeNull();
  });

  describe("authentication", () => {
    it("401s with no credentials", async () => {
      await enter(runner, 0);
      const res = await app.inject({ method: "GET", url: "/records/0/pass" });
      expect(res.statusCode).toBe(401);
    });

    it("401s a nonce signed by a different key than the address claims", async () => {
      const submitted = await enter(runner, 0);
      const headers = await credentials(runner);
      const { nonce } = (
        await app.inject({
          method: "POST",
          url: "/auth/challenge",
          payload: { address: runner.publicKey() },
        })
      ).json();
      const forged = {
        ...headers,
        "x-sterun-nonce": nonce,
        "x-sterun-signature": Buffer.from(other.sign(Buffer.from(nonce, "utf8"))).toString("base64"),
      };

      const res = await app.inject({ method: "GET", url: "/records/0/pass", headers: forged });

      expect(res.statusCode).toBe(401);
      expect(res.body).not.toContain(submitted.totpSecretHex);
    });

    it("401s a replayed nonce", async () => {
      await enter(runner, 0);
      const headers = await credentials(runner);
      expect((await app.inject({ method: "GET", url: "/records/0/pass", headers })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: "/records/0/pass", headers })).statusCode).toBe(401);
    });
  });

  describe("mounting", () => {
    it("is not mounted without a chain reader — ownership could not be checked", async () => {
      const noReader = buildServer(loadConfig({ NODE_ENV: "test" }), { pool, vault });
      await noReader.ready();
      expect((await noReader.inject({ url: "/records/0/pass" })).json().error).toBe("no-such-route");
      await noReader.close();
    });

    it("is not mounted without a vault", async () => {
      const noVault = buildServer(loadConfig({ NODE_ENV: "test" }), { pool, reader });
      await noVault.ready();
      expect((await noVault.inject({ url: "/records/0/pass" })).json().error).toBe("no-such-route");
      await noVault.close();
    });
  });
});
