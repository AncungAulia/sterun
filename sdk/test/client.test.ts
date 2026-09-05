/**
 * STE-15 — `SterunClient`, driven by fake binding clients.
 *
 * What is worth asserting here is not "does RPC work" (scripts/e2e.ts answers
 * that against the real contracts) but the part a live run would never catch:
 * that every method calls the contract function it claims to, with the
 * arguments mapped the right way round. `enter` passing `categoryId` where
 * `event_id` belongs would enter the wrong race and still look like a success
 * on testnet, and `addCategory` swapping quota and distance would sell 10,000
 * places at a 200-metre race. Those are one line each here and invisible there.
 */
import { describe, expect, it } from "vitest";
import type { Client as EventRegistryClient } from "event-registry";
import type { Client as RaceRecordClient } from "race-record";
import { SterunClient } from "../src/client.js";
import { SterunContractError } from "../src/errors.js";

const HASH = "feb3cea959e59a1f5a42e9bac1f36e0fccc266de05960e173226fcadfd63fe29";
const ORGANISER = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";
const RUNNER = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";
const SCANNER = "GD7DHD3FDWZRBU5GCI5LTQT2VFRJXRTSCG6DJOP5SNVOATYE76POYVCE";

const ok = <T>(value: T) => ({ unwrap: () => value, isErr: () => false });

/** An assembled transaction whose simulation succeeded. */
const good = <T>(result: T) => ({
  simulation: { transactionData: {}, result: {} },
  result,
  signAndSend: async () => ({
    result,
    sendTransactionResponse: { hash: "txhash" },
    getTransactionResponse: { txHash: "txhash", ledger: 7 },
  }),
});

/** An assembled transaction whose simulation reverted with `code`. */
const reverting = (code: number) => ({
  simulation: { error: `HostError: Error(Contract, #${code})` },
  result: undefined,
  signAndSend: async () => {
    throw new Error("must not be reached");
  },
});

/**
 * Records every call so a test can assert the arguments, and answers with
 * whatever that method was told to answer.
 */
function recorder(replies: Record<string, unknown>) {
  const calls: Array<{ method: string; args: unknown; options?: unknown }> = [];
  const target = new Proxy(
    {},
    {
      get: (_t, method: string) => {
        if (method === "then") return undefined;
        return async (args?: unknown, options?: unknown) => {
          calls.push({ method, args, options });
          const reply = replies[method];
          if (reply === undefined) throw new Error(`fake has no reply for ${method}`);
          return reply;
        };
      },
    },
  );
  return { target, calls };
}

function clientWith(
  registryReplies: Record<string, unknown> = {},
  recordReplies: Record<string, unknown> = {},
  extra: Partial<ConstructorParameters<typeof SterunClient>[0]> = {},
) {
  const registry = recorder(registryReplies);
  const record = recorder(recordReplies);
  const client = new SterunClient({
    rpcUrl: "https://rpc.invalid",
    networkPassphrase: "Test SDF Network ; September 2015",
    contracts: { eventRegistry: "CREGISTRY", raceRecord: "CRECORD" },
    bindings: {
      registry: registry.target as EventRegistryClient,
      record: record.target as RaceRecordClient,
    },
    ...extra,
  });
  return { client, registry, record };
}

describe("organiser flow maps onto EventRegistry", () => {
  it("createEvent sends the hash as bytes and the start time as u64", async () => {
    const { client, registry } = clientWith({ create_event: good(ok(3)) });

    const result = await client.createEvent({
      organiser: ORGANISER,
      name: "Sterun Testnet Rehearsal 2026",
      metadataHash: HASH,
      uri: "https://sterun.xyz/e.json",
      startsAt: 1789000000,
    });

    expect(result).toEqual({ value: 3, txHash: "txhash", ledger: 7 });
    expect(registry.calls[0]?.method).toBe("create_event");
    expect(registry.calls[0]?.args).toEqual({
      organiser: ORGANISER,
      name: "Sterun Testnet Rehearsal 2026",
      metadata_hash: Buffer.from(HASH, "hex"),
      uri: "https://sterun.xyz/e.json",
      // A number went in; a bigint must come out, because the field is u64.
      starts_at: 1789000000n,
    });
  });

  it("createEvent rejects a malformed hash before it reaches the network", async () => {
    const { client, registry } = clientWith({ create_event: good(ok(3)) });
    await expect(
      client.createEvent({
        organiser: ORGANISER,
        name: "x",
        metadataHash: "abc",
        uri: "u",
        startsAt: 1n,
      }),
    ).rejects.toThrow(/metadataHash/);
    expect(registry.calls).toHaveLength(0);
  });

  it("addCategory keeps quota, distance and price in their own fields", async () => {
    const { client, registry } = clientWith({ add_category: good(ok(0)) });

    await client.addCategory({
      eventId: 3,
      code: "10K",
      distanceM: 10_000,
      quota: 200,
      priceStroops: 50_000_000n,
    });

    expect(registry.calls[0]?.args).toEqual({
      event_id: 3,
      code: "10K",
      distance_m: 10_000,
      quota: 200,
      price_usdc: 50_000_000n,
    });
  });

  it("setEventStatus sends the tagged enum the bindings expect", async () => {
    const { client, registry } = clientWith({ set_event_status: good(ok(undefined)) });
    await client.setEventStatus(3, "Open");
    expect(registry.calls[0]?.args).toEqual({
      event_id: 3,
      status: { tag: "Open", values: undefined },
    });
  });

  it("adds and removes a scanner on the right event", async () => {
    const { client, registry } = clientWith({
      add_scanner: good(ok(undefined)),
      remove_scanner: good(ok(undefined)),
    });
    await client.addScanner(3, SCANNER);
    await client.removeScanner(3, SCANNER);
    expect(registry.calls.map(({ method, args }) => ({ method, args }))).toEqual([
      { method: "add_scanner", args: { event_id: 3, scanner: SCANNER } },
      { method: "remove_scanner", args: { event_id: 3, scanner: SCANNER } },
    ]);
  });
});

describe("reads convert the contract's shape into the caller's", () => {
  it("getEvent returns the caller-facing event", async () => {
    const { client } = clientWith({
      get_event: good(
        ok({
          metadata_hash: Buffer.from(HASH, "hex"),
          name: "Rehearsal",
          organiser: ORGANISER,
          starts_at: 1789000000n,
          status: { tag: "Open", values: undefined },
          uri: "https://sterun.xyz/e.json",
        }),
      ),
    });
    await expect(client.getEvent(0)).resolves.toEqual({
      eventId: 0,
      organiser: ORGANISER,
      name: "Rehearsal",
      metadataHash: HASH,
      uri: "https://sterun.xyz/e.json",
      startsAt: 1789000000n,
      status: "Open",
    });
  });

  it("listCategories walks the count and returns them in id order", async () => {
    const category = (code: string) =>
      good(
        ok({ code, distance_m: 5_000, quota: 10, entered_count: 1, price_usdc: 0n }),
      );
    const { client, registry } = clientWith({
      category_count: good(2),
      get_category: category("5K"),
    });

    const categories = await client.listCategories(4);

    expect(categories.map((c) => c.categoryId)).toEqual([0, 1]);
    expect(registry.calls.map((c) => c.method)).toEqual([
      "category_count",
      "get_category",
      "get_category",
    ]);
    expect(registry.calls[1]?.args).toEqual({ event_id: 4, category_id: 0 });
    expect(registry.calls[2]?.args).toEqual({ event_id: 4, category_id: 1 });
  });

  it("recordsOfDetailed resolves each id it was given", async () => {
    const { client, record } = clientWith(
      {},
      {
        records_of: good([4, 9]),
        record_of: good(
          ok({
            bib_no: 1,
            category_id: 0,
            claimed_at: undefined,
            entered_at: 1n,
            event_id: 0,
            finish_time_s: undefined,
            participant_hash: Buffer.from(HASH, "hex"),
            result_at: undefined,
            state: { tag: "Entered", values: undefined },
          }),
        ),
      },
    );

    const records = await client.recordsOfDetailed(RUNNER);

    expect(records.map((r) => r.tokenId)).toEqual([4, 9]);
    expect(record.calls[1]?.args).toEqual({ token_id: 4 });
    expect(record.calls[2]?.args).toEqual({ token_id: 9 });
  });

  it("verify hashes the argument into bytes and returns the boolean unchanged", async () => {
    const { client, record } = clientWith({}, { verify: good(true) });
    await expect(client.verify(0, HASH)).resolves.toBe(true);
    expect(record.calls[0]?.args).toEqual({
      token_id: 0,
      participant_hash: Buffer.from(HASH, "hex"),
    });
  });
});

describe("race flow maps onto RaceRecord", () => {
  it("enter sends runner, event, category and hash in the right slots", async () => {
    const { client, record } = clientWith({}, { enter: good(ok(12)) });

    const result = await client.enter({
      runner: RUNNER,
      eventId: 2,
      categoryId: 1,
      participantHash: HASH,
    });

    expect(result.value).toBe(12);
    expect(record.calls[0]?.method).toBe("enter");
    // event_id and category_id are both u32 and adjacent: swapping them is the
    // one mistake the type system cannot catch and testnet would not report.
    expect(record.calls[0]?.args).toEqual({
      runner: RUNNER,
      event_id: 2,
      category_id: 1,
      participant_hash: Buffer.from(HASH, "hex"),
    });
  });

  it("surfaces QuotaFull from enter as EventRegistry's, not RaceRecord's", async () => {
    // enter propagates the registry's revert unchanged, and #5 is in the 1..=99
    // band. Attributing it to RaceRecord would name the wrong contract in every
    // "sold out" message the entry flow shows.
    const { client } = clientWith({}, { enter: reverting(5) });
    const promise = client.enter({
      runner: RUNNER,
      eventId: 0,
      categoryId: 0,
      participantHash: HASH,
    });
    await expect(promise).rejects.toBeInstanceOf(SterunContractError);
    await expect(promise).rejects.toMatchObject({
      variant: "QuotaFull",
      source: "event-registry",
      method: "enter",
    });
  });

  it("surfaces AlreadyClaimed from a second check-in", async () => {
    const { client } = clientWith({}, { claim_racepack: reverting(102) });
    await expect(client.claimRacepack(0, SCANNER)).rejects.toMatchObject({
      variant: "AlreadyClaimed",
      source: "race-record",
    });
  });

  it("surfaces InvalidState when a finish is recorded before a race pack", async () => {
    const { client } = clientWith({}, { record_finish: reverting(103) });
    await expect(client.recordFinish(0, 3161)).rejects.toMatchObject({
      variant: "InvalidState",
      source: "race-record",
    });
  });

  it("passes the finish time as seconds and the token as u32", async () => {
    const { client, record } = clientWith({}, { record_finish: good(ok(undefined)) });
    await client.recordFinish(5, 3161);
    expect(record.calls[0]?.args).toEqual({ token_id: 5, finish_time_s: 3161 });
  });

  it("recordDnf and extendRecordTtl address one token each", async () => {
    const { client, record } = clientWith(
      {},
      { record_dnf: good(ok(undefined)), extend_record_ttl: good(ok(undefined)) },
    );
    await client.recordDnf(5);
    await client.extendRecordTtl(5);
    expect(record.calls.map(({ method, args }) => ({ method, args }))).toEqual([
      { method: "record_dnf", args: { token_id: 5 } },
      { method: "extend_record_ttl", args: { token_id: 5 } },
    ]);
  });
});

describe("actors", () => {
  const signer = { address: RUNNER, signTransaction: async () => ({ signedTxXdr: "" }) };
  const other = { address: ORGANISER, signTransaction: async () => ({ signedTxXdr: "" }) };

  it("uses the client's signer and public key when a call does not name one", async () => {
    const { client, record } = clientWith(
      {},
      { enter: good(ok(1)) },
      { signTransaction: signer, publicKey: RUNNER },
    );
    await client.enter({ runner: RUNNER, eventId: 0, categoryId: 0, participantHash: HASH });
    expect(record.calls[0]?.options).toEqual({ publicKey: RUNNER, signTransaction: signer });
  });

  it("lets a per-call actor override both fields", async () => {
    // The organiser console does exactly this: one client, but a check-in is
    // signed by the scanner device while the result is signed by the organiser.
    const { client, record } = clientWith(
      {},
      { claim_racepack: good(ok(undefined)) },
      { signTransaction: signer, publicKey: RUNNER },
    );
    await client.claimRacepack(0, SCANNER, { publicKey: ORGANISER, signTransaction: other });
    expect(record.calls[0]?.options).toEqual({
      publicKey: ORGANISER,
      signTransaction: other,
    });
  });

  it("sends the source account to the contract call, not only the signer", async () => {
    // publicKey is what the transaction is simulated for, and the simulation is
    // what records the auth entries. Passing only the signer would simulate as
    // the client's default account and produce an auth tree the signature
    // cannot satisfy.
    const { client, record } = clientWith({}, { record_dnf: good(ok(undefined)) });
    await client.recordDnf(1, { publicKey: ORGANISER, signTransaction: other });
    expect(record.calls[0]?.options).toMatchObject({ publicKey: ORGANISER });
  });

  it("omits both fields entirely when there are none, rather than sending undefined", async () => {
    // exactOptionalPropertyTypes is on, and an explicit `publicKey: undefined`
    // is not the same thing as an absent one to the SDK's option merging.
    const { client, record } = clientWith({}, { record_dnf: good(ok(undefined)) });
    await client.recordDnf(1);
    expect(record.calls[0]?.options).toEqual({});
  });

  it("SterunClient.as() turns a keypair into both fields at once", () => {
    const keypair = { publicKey: () => RUNNER };
    expect(SterunClient.as(keypair)).toEqual({ publicKey: RUNNER, signTransaction: keypair });
  });

  it("readOnly() drops the signer and the public key", async () => {
    const { client } = clientWith({}, {}, { signTransaction: signer, publicKey: RUNNER });
    const view = client.readOnly();
    // Same contracts, no ability to sign: what a public profile page gets.
    expect(view.contracts).toEqual(client.contracts);
    expect(view).not.toBe(client);
  });
});
