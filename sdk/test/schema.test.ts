/**
 * STE-19 — RaceRecord JSON Schema v1.0.
 *
 * This is a published format that third parties will store and re-read, so the
 * tests here are about the promises it makes rather than about plumbing: that
 * the committed JSON Schema is what the validator actually enforces, that the
 * document cannot carry personal data, and that large numbers survive a JSON
 * round trip.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  RACE_RECORD_SCHEMA_VERSION,
  parseRaceRecordDocument,
  raceRecordDocumentSchema,
  raceRecordJsonSchema,
  safeParseRaceRecordDocument,
} from "../src/schema.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const HASH = "feb3cea959e59a1f5a42e9bac1f36e0fccc266de05960e173226fcadfd63fe29";
const ORGANISER = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";
const RUNNER = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";
const REGISTRY = "CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64";
const RECORD = "CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4";

/**
 * A valid document: the STE-33 rehearsal record, in the public format.
 *
 * Typed loosely on purpose. Most tests below mutate one field into something
 * the schema must reject, and an inferred literal type would make writing those
 * mutations a fight with the compiler rather than a test of the validator.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const valid = (): Record<string, any> => ({
  schema_version: "1.0.0",
  network: { passphrase: "Test SDF Network ; September 2015", event_registry: REGISTRY, race_record: RECORD },
  token_id: 0,
  owner: RUNNER,
  bib_no: 0,
  participant_hash: HASH,
  state: "Finished",
  event: {
    event_id: 0,
    name: "Sterun Testnet Rehearsal 2026",
    organiser: ORGANISER,
    uri: "https://sterun.xyz/events/sanity-2026-09-01.json",
    metadata_hash: "2d548a2bc77dd958d60b0b1181186fe6fd2f36624cded1d4c915f8874ee83b68",
    starts_at: "1789000000",
    status: "Open",
  },
  category: {
    category_id: 0,
    code: "10K",
    distance_m: 10_000,
    quota: 5,
    entered_count: 4,
    price_stroops: "50000000",
  },
  timings: {
    entered_at: "1788252277",
    claimed_at: "1788252342",
    finish_time_s: 3161,
    result_at: "1788252352",
  },
  links: {
    record_contract: `https://stellar.expert/explorer/testnet/contract/${RECORD}`,
    owner_account: `https://stellar.expert/explorer/testnet/account/${RUNNER}`,
    transactions: { entered: null, claimed: null, result: null },
  },
});

describe("the committed JSON Schema is the one the validator enforces", () => {
  it("matches what src/schema.ts generates, byte for byte", () => {
    // Two artefacts, one definition. A hand-edit to the JSON — or a change to
    // the zod schema without regenerating — fails here rather than shipping a
    // document format that disagrees with its own validator.
    const committed = readFileSync(
      resolve(HERE, "..", "schema", "race-record-v1.0.json"),
      "utf8",
    );
    expect(committed).toBe(`${JSON.stringify(raceRecordJsonSchema(), null, 2)}\n`);
  });

  it("declares its version inside the document, not only in the filename", () => {
    const schema = raceRecordJsonSchema();
    expect(schema.version).toBe(RACE_RECORD_SCHEMA_VERSION);
    expect(schema.$id).toContain("v1.0");
    // And every instance carries it too: a consumer who saved a file last year
    // has the file, not the URL it came from.
    expect(valid().schema_version).toBe(RACE_RECORD_SCHEMA_VERSION);
  });

  it("is draft 2020-12 and closed to unknown properties", () => {
    const schema = raceRecordJsonSchema() as { $schema: string; additionalProperties: unknown };
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.additionalProperties).toBe(false);
  });
});

describe("a valid document", () => {
  it("parses, and comes back unchanged", () => {
    expect(parseRaceRecordDocument(valid())).toEqual(valid());
  });

  it("accepts a record that has not finished yet, with nulls rather than absences", () => {
    const entered = valid();
    entered.state = "Entered";
    entered.timings = { entered_at: "1788252277", claimed_at: null, finish_time_s: null, result_at: null };
    expect(safeParseRaceRecordDocument(entered).success).toBe(true);
  });

  it("accepts a free category priced at zero", () => {
    const free = valid();
    free.category.price_stroops = "0";
    expect(safeParseRaceRecordDocument(free).success).toBe(true);
  });

  it("accepts every lifecycle state and every event status", () => {
    for (const state of ["Entered", "RacepackClaimed", "Finished", "Dnf"]) {
      const doc = valid();
      doc.state = state;
      expect(safeParseRaceRecordDocument(doc).success).toBe(true);
    }
    for (const status of ["Draft", "Open", "Closed", "Completed"]) {
      const doc = valid();
      doc.event.status = status;
      expect(safeParseRaceRecordDocument(doc).success).toBe(true);
    }
  });
});

describe("the document cannot carry personal data", () => {
  it.each(["name", "national_id", "emergency_contact", "salt", "totp_secret"])(
    "rejects a document with a top-level %s",
    (field) => {
      // additionalProperties: false is the control, not the documentation. PII
      // reaching a file designed to be handed to strangers is the one failure
      // this format must make impossible.
      const leaked = { ...valid(), [field]: "Sri Wahyuni" };
      expect(safeParseRaceRecordDocument(leaked).success).toBe(false);
    },
  );

  it("rejects extra properties nested inside the event too", () => {
    const leaked = valid();
    (leaked.event as Record<string, unknown>).organiser_email = "a@b.c";
    expect(safeParseRaceRecordDocument(leaked).success).toBe(false);
  });

  it("has no property anywhere that could name a person", () => {
    // Read the generated schema rather than the zod source: this asserts the
    // published artefact, which is what a third party actually receives.
    const json = JSON.stringify(raceRecordJsonSchema());
    for (const forbidden of ['"national_id"', '"emergency_contact"', '"salt"', '"totp_secret"']) {
      expect(json).not.toContain(forbidden);
    }
    // `name` exists, but only as the event's name — never a person's.
    const schema = raceRecordJsonSchema() as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).not.toContain("name");
  });
});

describe("large numbers are strings, and that is load-bearing", () => {
  it("survives a JSON round trip that would break a double", () => {
    // 2^53 is where JSON numbers stop being exact. price_stroops is an i128.
    const big = valid();
    big.category.price_stroops = "170141183460469231731687303715884105727";
    const round = parseRaceRecordDocument(JSON.parse(JSON.stringify(big)));
    expect(round.category.price_stroops).toBe("170141183460469231731687303715884105727");
    expect(BigInt(round.category.price_stroops)).toBe(2n ** 127n - 1n);
  });

  it("rejects a number where a decimal string belongs", () => {
    const wrong = valid();
    (wrong.category as Record<string, unknown>).price_stroops = 50_000_000;
    expect(safeParseRaceRecordDocument(wrong).success).toBe(false);
  });

  it.each(["-1", "1.5", "50_000_000", "1e7", "", " 1"])(
    "rejects %o as a stroop amount",
    (value) => {
      const wrong = valid();
      wrong.category.price_stroops = value;
      expect(safeParseRaceRecordDocument(wrong).success).toBe(false);
    },
  );

  it("keeps u32 fields as real numbers", () => {
    // bib_no and finish_time_s cannot reach the precision cliff, and making
    // them strings would make arithmetic awkward for no gain.
    const schema = raceRecordJsonSchema() as {
      properties: { bib_no: { type: string } };
    };
    expect(schema.properties.bib_no.type).toBe("integer");
  });
});

describe("addresses and hashes are checked, not merely typed", () => {
  it.each([
    ["owner", "CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64"],
    ["owner", "GAJV"],
    ["owner", ""],
  ])("rejects %s = %o", (field, value) => {
    const wrong = valid() as Record<string, unknown>;
    wrong[field] = value;
    expect(safeParseRaceRecordDocument(wrong).success).toBe(false);
  });

  it("rejects a contract address where an account belongs, and vice versa", () => {
    const swapped = valid();
    swapped.network.race_record = RUNNER;
    expect(safeParseRaceRecordDocument(swapped).success).toBe(false);
  });

  it.each([
    HASH.toUpperCase(),
    `0x${HASH}`,
    HASH.slice(0, 62),
    `${HASH}ff`,
  ])("rejects participant_hash %o", (value) => {
    // Lowercase, exactly 64, no prefix. One canonical rendering, so two copies
    // of the same hash always compare equal as strings.
    const wrong = valid();
    wrong.participant_hash = value;
    expect(safeParseRaceRecordDocument(wrong).success).toBe(false);
  });

  it("reports every problem at once rather than the first", () => {
    const wrong = valid();
    wrong.owner = "nope";
    wrong.participant_hash = "nope";
    const result = raceRecordDocumentSchema.safeParse(wrong);
    expect(result.success).toBe(false);
    expect(result.error?.issues.length).toBeGreaterThanOrEqual(2);
  });
});
