/**
 * STE-16 — `ChainReader` over a fake network.
 *
 * The fake answers in real XDR, so these tests exercise argument encoding,
 * simulation handling and the decoders together. What they are really pinning
 * down are the three contract behaviours the rest of the indexer is built on
 * and would be expensive to rediscover:
 *
 *   - a view that never reverts (`event_count`, `is_scanner`) versus one that
 *     does (`get_event`);
 *   - `get_category` answering CategoryNotFound for a missing EVENT;
 *   - `total_supply` bounding a gapless token id range, which is what makes the
 *     rebuild walk correct.
 */
import { describe, expect, it } from "vitest";
import { ChainReader, dedupeKeys } from "../src/chain/reader.js";
import { ContractRevertError } from "../src/chain/errors.js";
import { FakeChain, fakeLedgerKey } from "./helpers/fake-chain.js";

import { ADDRESSES, ORGANISER, RUNNER, SCANNER as OTHER } from "./helpers/addresses.js";

function chain(): { fake: FakeChain; reader: ChainReader } {
  const fake = new FakeChain(ADDRESSES);
  return { fake, reader: new ChainReader(fake, ADDRESSES) };
}

describe("EventRegistry views", () => {
  it("counts events and categories without reverting on an unknown id", () => {
    const { fake, reader } = chain();
    return (async () => {
      expect(await reader.eventCount()).toBe(0);
      expect(await reader.categoryCount(99)).toBe(0);

      fake.addEvent({ eventId: 0, organiser: ORGANISER });
      fake.addCategory({ eventId: 0, categoryId: 0 });
      expect(await reader.eventCount()).toBe(1);
      expect(await reader.categoryCount(0)).toBe(1);
    })();
  });

  it("reads an event into the typed shape", async () => {
    const { fake, reader } = chain();
    fake.addEvent({ eventId: 1, organiser: ORGANISER, name: "Jakarta Run", status: "Open" });
    expect(await reader.getEvent(1)).toEqual({
      eventId: 1,
      organiser: ORGANISER,
      name: "Jakarta Run",
      metadataHash: "aa".repeat(32),
      uri: "ipfs://event/1",
      startsAt: 1_800_000_000n,
      status: "Open",
    });
  });

  it("propagates EventNotFound(2) as a typed revert", async () => {
    const { reader } = chain();
    await expect(reader.getEvent(9)).rejects.toBeInstanceOf(ContractRevertError);
    await expect(reader.getEvent(9)).rejects.toMatchObject({
      code: 2,
      source: "event-registry",
      variant: "EventNotFound",
      isNotFound: true,
    });
  });

  it("answers CategoryNotFound(3) for a missing event, not EventNotFound", async () => {
    // INTERFACE.md §1.1 calls this out explicitly, and code that used the
    // revert to tell the two apart would be wrong in a way that only shows up
    // on a mistyped event id.
    const { reader } = chain();
    await expect(reader.getCategory(9, 0)).rejects.toMatchObject({ code: 3 });
  });

  it("reads a category with the price as a bigint", async () => {
    const { fake, reader } = chain();
    fake.addEvent({ eventId: 0, organiser: ORGANISER });
    fake.addCategory({ eventId: 0, categoryId: 1, code: "5K", distanceM: 5_000, priceStroops: 0n });
    const category = await reader.getCategory(0, 1);
    expect(category).toMatchObject({ code: "5K", distanceM: 5_000, priceStroops: 0n });
    expect(typeof category.priceStroops).toBe("bigint");
  });

  it("answers is_scanner false for an unknown event instead of reverting", async () => {
    const { reader } = chain();
    expect(await reader.isScanner(9, RUNNER)).toBe(false);
  });

  it("answers is_scanner true only for an allowlisted address", async () => {
    const { fake, reader } = chain();
    fake.addEvent({ eventId: 0, organiser: ORGANISER, scanners: [OTHER] });
    expect(await reader.isScanner(0, OTHER)).toBe(true);
    expect(await reader.isScanner(0, RUNNER)).toBe(false);
  });

  it("reads the organiser, and reverts EventNotFound for an event that is not there", async () => {
    const { fake, reader } = chain();
    fake.addEvent({ eventId: 0, organiser: ORGANISER });
    expect(await reader.getOrganiser(0)).toBe(ORGANISER);
    await expect(reader.getOrganiser(1)).rejects.toMatchObject({ variant: "EventNotFound" });
  });
});

describe("RaceRecord views", () => {
  it("reads total_supply, which bounds the rebuild walk", async () => {
    const { fake, reader } = chain();
    expect(await reader.totalSupply()).toBe(0);
    fake.addRecord({ tokenId: 0, eventId: 0, owner: RUNNER });
    fake.addRecord({ tokenId: 1, eventId: 0, owner: RUNNER });
    expect(await reader.totalSupply()).toBe(2);
  });

  it("assumes token ids are 0 .. total_supply - 1 with no gaps", async () => {
    // Records are minted with Enumerable::sequential_mint from zero and there
    // is no burn export (INTERFACE.md §4), so every id below total_supply
    // resolves. Stated as a test because the rebuild walk depends on it: a
    // future contract with a burn path breaks this line, not the index.
    const { fake, reader } = chain();
    for (let id = 0; id < 5; id += 1) fake.addRecord({ tokenId: id, eventId: 0, owner: RUNNER });
    const supply = await reader.totalSupply();
    for (let id = 0; id < supply; id += 1) {
      await expect(reader.recordOf(id)).resolves.toMatchObject({ tokenId: id });
    }
  });

  it("reads a record with every Option absent", async () => {
    const { fake, reader } = chain();
    fake.addRecord({ tokenId: 0, eventId: 2, owner: RUNNER, categoryId: 1, bibNo: 5 });
    expect(await reader.recordOf(0)).toMatchObject({
      tokenId: 0,
      eventId: 2,
      categoryId: 1,
      bibNo: 5,
      state: "Entered",
      claimedAt: null,
      finishTimeS: null,
      resultAt: null,
    });
  });

  it("reads a finished record with every Option present", async () => {
    const { fake, reader } = chain();
    fake.addRecord({
      tokenId: 0,
      eventId: 0,
      owner: RUNNER,
      state: "Finished",
      claimedAt: 1_800_000_200n,
      finishTimeS: 3_599,
      resultAt: 1_800_000_300n,
    });
    expect(await reader.recordOf(0)).toMatchObject({
      state: "Finished",
      claimedAt: 1_800_000_200n,
      finishTimeS: 3_599,
      resultAt: 1_800_000_300n,
    });
  });

  it("propagates RecordNotFound(101) and OZ NonExistentToken(200)", async () => {
    const { reader } = chain();
    await expect(reader.recordOf(0)).rejects.toMatchObject({
      code: 101,
      source: "race-record",
      isNotFound: true,
    });
    await expect(reader.ownerOf(0)).rejects.toMatchObject({
      code: 200,
      source: "openzeppelin",
      isNotFound: true,
    });
  });

  it("reads records_of, empty for an address with none", async () => {
    const { fake, reader } = chain();
    fake.addRecord({ tokenId: 0, eventId: 0, owner: RUNNER });
    fake.addRecord({ tokenId: 1, eventId: 0, owner: OTHER });
    fake.addRecord({ tokenId: 2, eventId: 1, owner: RUNNER });
    expect(await reader.recordsOf(RUNNER)).toEqual([0, 2]);
    expect(await reader.recordsOf(ORGANISER)).toEqual([]);
  });
});

describe("footprints — what the TTL keeper extends", () => {
  it("unions the keys of record_of and owner_of, without duplicating the shared ones", async () => {
    const { fake, reader } = chain();
    fake.addRecord({ tokenId: 3, eventId: 0, owner: RUNNER });
    const keys = await reader.recordFootprint(3);
    const ids = keys.map((k) => k.toXdr("base64"));

    expect(new Set(ids).size).toBe(ids.length);
    // Both probes carry the contract instance and wasm; without deduplication
    // the keeper would pay to extend them twice per record.
    expect(ids).toContain(fakeLedgerKey(ADDRESSES.raceRecord, "instance").toXdr("base64"));
    expect(ids).toContain(fakeLedgerKey(ADDRESSES.raceRecord, "record:3").toXdr("base64"));
    expect(ids).toContain(fakeLedgerKey(ADDRESSES.raceRecord, "owner:3").toXdr("base64"));
  });

  it("collects the per-owner enumeration entry separately", async () => {
    // records_of touches keys no single-record read does, which is why the
    // keeper walks runners as well as tokens.
    const { fake, reader } = chain();
    fake.addRecord({ tokenId: 0, eventId: 0, owner: RUNNER });
    const ids = (await reader.runnerFootprint(RUNNER)).map((k) => k.toXdr("base64"));
    expect(ids).toContain(fakeLedgerKey(ADDRESSES.raceRecord, `owned:${RUNNER}`).toXdr("base64"));
  });

  it("dedupes ledger keys by XDR identity, not by object identity", () => {
    const a = fakeLedgerKey(ADDRESSES.raceRecord, "record:1");
    const b = fakeLedgerKey(ADDRESSES.raceRecord, "record:1");
    const c = fakeLedgerKey(ADDRESSES.raceRecord, "record:2");
    expect(a).not.toBe(b);
    expect(dedupeKeys([a, b, c])).toHaveLength(2);
  });

  it("keeps the empty case empty", () => {
    expect(dedupeKeys([])).toEqual([]);
  });
});

describe("call shapes", () => {
  it("encodes u32 and address arguments as the contract expects", async () => {
    const { fake, reader } = chain();
    fake.addEvent({ eventId: 4, organiser: ORGANISER });
    await reader.isScanner(4, RUNNER);
    expect(fake.calls.at(-1)).toEqual({
      contractId: ADDRESSES.eventRegistry,
      method: "is_scanner",
      args: [4, RUNNER],
    });
  });

  it("asks the right contract for each view", async () => {
    const { fake, reader } = chain();
    await reader.eventCount();
    await reader.totalSupply();
    expect(fake.calls.map((c) => [c.contractId, c.method])).toEqual([
      [ADDRESSES.eventRegistry, "event_count"],
      [ADDRESSES.raceRecord, "total_supply"],
    ]);
  });
});
