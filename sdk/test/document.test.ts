/**
 * STE-19 — building the public document out of chain reads.
 *
 * The builder is where bigints become strings and where three separate contract
 * reads become one self-contained file, so these tests are mostly about the
 * joins being right and the numbers surviving.
 */
import { describe, expect, it } from "vitest";
import { buildRaceRecordDocument, explorerBase } from "../src/document.js";
import { safeParseRaceRecordDocument } from "../src/schema.js";
import type { SterunCategory, SterunEvent, SterunRecord } from "../src/types.js";

const HASH = "feb3cea959e59a1f5a42e9bac1f36e0fccc266de05960e173226fcadfd63fe29";
const META = "2d548a2bc77dd958d60b0b1181186fe6fd2f36624cded1d4c915f8874ee83b68";
const ORGANISER = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";
const RUNNER = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";
const REGISTRY = "CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64";
const RECORD = "CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4";
const TESTNET = "Test SDF Network ; September 2015";

const record: SterunRecord = {
  tokenId: 0,
  eventId: 0,
  categoryId: 0,
  bibNo: 0,
  participantHash: HASH,
  state: "Finished",
  enteredAt: 1788252277n,
  claimedAt: 1788252342n,
  finishTimeS: 3161,
  resultAt: 1788252352n,
};

const event: SterunEvent = {
  eventId: 0,
  organiser: ORGANISER,
  name: "Sterun Testnet Rehearsal 2026",
  metadataHash: META,
  uri: "https://sterun.xyz/events/sanity-2026-09-01.json",
  startsAt: 1789000000n,
  status: "Open",
};

const category: SterunCategory = {
  eventId: 0,
  categoryId: 0,
  code: "10K",
  distanceM: 10_000,
  quota: 5,
  enteredCount: 4,
  priceStroops: 50_000_000n,
  slotsLeft: 1,
};

const network = { passphrase: TESTNET, eventRegistry: REGISTRY, raceRecord: RECORD };
const build = (over: Partial<Parameters<typeof buildRaceRecordDocument>[0]> = {}) =>
  buildRaceRecordDocument({ record, event, category, owner: RUNNER, network, ...over });

describe("buildRaceRecordDocument", () => {
  it("joins record, event and category into one self-contained document", () => {
    const doc = build();
    expect(doc.token_id).toBe(0);
    expect(doc.owner).toBe(RUNNER);
    expect(doc.event.name).toBe("Sterun Testnet Rehearsal 2026");
    expect(doc.category.code).toBe("10K");
    // The point of the join: a stranger reading this file does not have to ask
    // anyone what event 0 category 0 was.
    expect(doc.event.organiser).toBe(ORGANISER);
    expect(doc.category.distance_m).toBe(10_000);
  });

  it("renders every 64- and 128-bit value as a decimal string", () => {
    const doc = build();
    expect(doc.event.starts_at).toBe("1789000000");
    expect(doc.timings.entered_at).toBe("1788252277");
    expect(doc.timings.claimed_at).toBe("1788252342");
    expect(doc.timings.result_at).toBe("1788252352");
    expect(doc.category.price_stroops).toBe("50000000");
    // and keeps u32s as numbers
    expect(doc.timings.finish_time_s).toBe(3161);
    expect(doc.bib_no).toBe(0);
  });

  it("survives an i128 that a JSON number could not hold", () => {
    const huge = { ...category, priceStroops: 2n ** 127n - 1n };
    const doc = build({ category: huge });
    const round = JSON.parse(JSON.stringify(doc)) as typeof doc;
    expect(BigInt(round.category.price_stroops)).toBe(2n ** 127n - 1n);
  });

  it("carries a free category as \"0\", not as an absence", () => {
    const doc = build({ category: { ...category, priceStroops: 0n } });
    expect(doc.category.price_stroops).toBe("0");
  });

  it("turns absent timings into null so they survive JSON", () => {
    const fresh: SterunRecord = {
      ...record,
      state: "Entered",
      claimedAt: null,
      finishTimeS: null,
      resultAt: null,
    };
    const doc = build({ record: fresh });
    expect(doc.timings).toEqual({
      entered_at: "1788252277",
      claimed_at: null,
      finish_time_s: null,
      result_at: null,
    });
    expect(JSON.parse(JSON.stringify(doc)).timings.claimed_at).toBeNull();
  });

  it("validates its own output", () => {
    // The builder parses before returning, so the SDK can never emit a document
    // its own schema rejects. Asserting it here keeps that guarantee visible.
    expect(safeParseRaceRecordDocument(build()).success).toBe(true);
  });

  it("refuses to build a document from a record it cannot represent", () => {
    const broken = { ...record, participantHash: "not-a-hash" };
    expect(() => build({ record: broken })).toThrow();
  });

  it("defaults transaction provenance to null rather than omitting it", () => {
    // Chain state does not say which transaction produced it; that comes from
    // the indexer. Nulls say "unknown" — omission would say "none happened".
    expect(build().links.transactions).toEqual({ entered: null, claimed: null, result: null });
  });

  it("carries provenance the caller supplies", () => {
    const tx = "a".repeat(64);
    const doc = build({ transactions: { entered: tx } });
    expect(doc.links.transactions).toEqual({ entered: tx, claimed: null, result: null });
  });

  it("rejects provenance that is not a transaction hash", () => {
    expect(() => build({ transactions: { entered: "nope" } })).toThrow();
  });
});

describe("explorer links follow the network, not a separate setting", () => {
  it.each([
    [TESTNET, "testnet"],
    ["Public Global Stellar Network ; September 2015", "public"],
    ["Test SDF Future Network ; October 2022", "futurenet"],
  ])("maps %o to the %s explorer", (passphrase, segment) => {
    expect(explorerBase(passphrase)).toBe(`https://stellar.expert/explorer/${segment}`);
  });

  it("points at the contract and the runner", () => {
    const doc = build();
    expect(doc.links.record_contract).toBe(
      `https://stellar.expert/explorer/testnet/contract/${RECORD}`,
    );
    expect(doc.links.owner_account).toBe(
      `https://stellar.expert/explorer/testnet/account/${RUNNER}`,
    );
  });

  it("records which deployment the document came from", () => {
    // v1 contracts are non-upgradeable, so the address pair identifies the
    // deployment exactly — a record read from a redeployed pair is a different
    // record, and the document says so.
    expect(build().network).toEqual({
      passphrase: TESTNET,
      event_registry: REGISTRY,
      race_record: RECORD,
    });
  });
});
