/**
 * STE-19 (C6) — RaceRecord JSON Schema v1.0.
 *
 * Handoff contract #5 in `docs/SYSTEM_DESIGN.md` §9: the public verification
 * format. A runner profile page renders it, an insurer or another organiser
 * consumes it, and none of them should have to learn Soroban to read a race
 * result. It is the shape that makes "a verifiable race history that is not
 * locked inside one organiser's database" an actual file rather than a claim.
 *
 * ## One definition, two artefacts
 *
 * The zod schema below is the source of truth. `schema/race-record-v1.0.json`
 * is generated from it with `z.toJSONSchema`, and `test/schema.test.ts` fails if
 * the committed file and the generated one disagree. So TypeScript consumers get
 * runtime validation and everyone else gets a standards-compliant document, and
 * neither can drift from the other — the failure mode a hand-written pair of
 * these always eventually reaches.
 *
 * ## Why every large number is a string
 *
 * `price_stroops`, `starts_at`, `entered_at`, `claimed_at` and `result_at` are
 * decimal **strings**, not JSON numbers, and that is not squeamishness.
 * `JSON.parse` produces IEEE-754 doubles: integers above 2^53 lose precision
 * silently, and `price_stroops` is an `i128`. An entry fee that round-trips
 * through a double can come back a stroop short, and a stroop short of the fee
 * is an `enter` that fails with nothing the caller can act on. Rendering them as
 * strings makes the document exact in every language, not just the ones with
 * bigints.
 *
 * `finish_time_s`, `bib_no`, `token_id`, `distance_m`, `quota` are `u32` and
 * stay numbers: they cannot reach the precision cliff, and making them strings
 * would just make arithmetic awkward for no gain.
 *
 * ## What is deliberately absent
 *
 * No name, no national ID, no emergency contact, no salt, no TOTP secret. The
 * document carries `participant_hash` and nothing else about the person. That
 * hash is a commitment: whoever holds the off-chain data plus the salt can
 * recompute it and prove the record is that person, and nobody else can work
 * backwards from it. Putting any of the rest in here would move PII into a file
 * designed to be handed to strangers.
 */
import { z } from "zod";

/**
 * Version of this schema, carried inside every document it describes.
 *
 * The ticket asks for the version to live in the document itself, and the reason
 * is worth stating: a consumer that fetched a record last year has a file, not a
 * URL. Without a version inside it, deciding how to read that file means
 * guessing.
 */
export const RACE_RECORD_SCHEMA_VERSION = "1.0.0";

export const SCHEMA_ID = "https://sterun.xyz/schemas/race-record/v1.0.json";

/** A Stellar account address, `G…`. */
const accountAddress = z
  .string()
  .regex(/^G[A-Z2-7]{55}$/, "must be a Stellar account address (G…, 56 characters)");

/** A Soroban contract address, `C…`. */
const contractAddress = z
  .string()
  .regex(/^C[A-Z2-7]{55}$/, "must be a Soroban contract address (C…, 56 characters)");

/** 32 bytes as lowercase hex, no `0x`. */
const hash32 = z.string().regex(/^[0-9a-f]{64}$/, "must be 32 bytes as 64 lowercase hex characters");

/** A non-negative integer rendered as a decimal string. See the header. */
const bigintString = z.string().regex(/^\d+$/, "must be a non-negative integer as a decimal string");

/** A 64-character transaction hash, lowercase hex. */
const txHash = z.string().regex(/^[0-9a-f]{64}$/, "must be a transaction hash in lowercase hex");

export const eventStatusSchema = z.enum(["Draft", "Open", "Closed", "Completed"]);
export const recordStateSchema = z.enum(["Entered", "RacepackClaimed", "Finished", "Dnf"]);

/**
 * Every object here is `strictObject`, not `object`.
 *
 * zod's default is to *strip* unknown keys and report success, which would put
 * the runtime validator and the published JSON Schema — which says
 * `additionalProperties: false` — in quiet disagreement: an external validator
 * would reject a document this SDK had just called valid. And for the property
 * that matters most, silence is the wrong answer entirely. A document arriving
 * with `national_id` on it is not a valid document with a stray field; it is
 * evidence that something upstream is leaking personal data into a format
 * designed to be handed to strangers, and it should be loud.
 */
export const raceRecordDocumentSchema = z
  .strictObject({
    schema_version: z.literal(RACE_RECORD_SCHEMA_VERSION),

    network: z
      .strictObject({
        passphrase: z.string().min(1),
        event_registry: contractAddress,
        race_record: contractAddress,
      })
      .describe("Which chain and which deployment this record was read from. v1 contracts are non-upgradeable, so the pair of addresses identifies the deployment exactly."),

    token_id: z.int().nonnegative(),
    owner: accountAddress.describe("The runner. No exported contract path can ever change it."),
    bib_no: z.int().nonnegative(),
    participant_hash: hash32.describe(
      "sha256(name || national_id || emergency_contact || salt) — a commitment to off-chain personal data, never the data itself.",
    ),
    state: recordStateSchema,

    event: z.strictObject({
      event_id: z.int().nonnegative(),
      name: z.string(),
      organiser: accountAddress,
      uri: z.string(),
      metadata_hash: hash32,
      starts_at: bigintString.describe("Unix seconds."),
      status: eventStatusSchema,
    }),

    category: z.strictObject({
      category_id: z.int().nonnegative(),
      code: z.string(),
      distance_m: z.int().positive(),
      quota: z.int().positive(),
      entered_count: z.int().nonnegative(),
      price_stroops: bigintString.describe(
        "Entry fee in token stroops, 7 decimals. \"0\" means a free category.",
      ),
    }),

    timings: z.strictObject({
      entered_at: bigintString,
      claimed_at: bigintString.nullable(),
      finish_time_s: z.int().nonnegative().nullable().describe("Net finish time in seconds."),
      result_at: bigintString.nullable(),
    }),

    links: z.strictObject({
      record_contract: z.url(),
      owner_account: z.url(),
      transactions: z
        .strictObject({
          entered: txHash.nullable(),
          claimed: txHash.nullable(),
          result: txHash.nullable(),
        })
        .describe(
          "Provenance, when the caller has it. Chain state alone does not say which transaction produced it — that comes from the indexer (STE-16) — so all three are nullable and a document without them is still valid.",
        ),
    }),
  })
  .describe(
    "One Sterun race record, in the public form a profile page renders and a third party verifies.",
  );

export type RaceRecordDocument = z.infer<typeof raceRecordDocumentSchema>;

/**
 * Validate an untrusted document. Throws `ZodError` describing every problem.
 *
 * Use this on anything that arrived from outside the process — a file, an API
 * response, a copy somebody emailed you.
 */
export function parseRaceRecordDocument(value: unknown): RaceRecordDocument {
  return raceRecordDocumentSchema.parse(value);
}

/** Validate without throwing. */
export function safeParseRaceRecordDocument(
  value: unknown,
): z.ZodSafeParseResult<RaceRecordDocument> {
  return raceRecordDocumentSchema.safeParse(value);
}

/** The JSON Schema document, generated — never hand-written. */
export function raceRecordJsonSchema(): Record<string, unknown> {
  const generated = z.toJSONSchema(raceRecordDocumentSchema, { target: "draft-2020-12" });
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: SCHEMA_ID,
    title: "Sterun RaceRecord",
    version: RACE_RECORD_SCHEMA_VERSION,
    ...generated,
  };
}
