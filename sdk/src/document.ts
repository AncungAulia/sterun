/**
 * STE-19 (C6) — assembling a {@link RaceRecordDocument} out of chain reads.
 *
 * A record on its own is not much use to a stranger: it says `event_id 2,
 * category_id 1, bib 87` and leaves them to find out what race that was. The
 * public format joins the record to its event and category so the document
 * stands alone, which is what makes it something an insurer or another
 * organiser can act on without asking Sterun for context.
 *
 * Everything here is read-only, so a profile page produces one of these with no
 * wallet connected.
 */
import {
  RACE_RECORD_SCHEMA_VERSION,
  raceRecordDocumentSchema,
  type RaceRecordDocument,
} from "./schema.js";
import type { SterunCategory, SterunEvent, SterunRecord } from "./types.js";

/** Transaction hashes, when the caller has them. See the schema's `links`. */
export interface RecordProvenance {
  entered?: string | null;
  claimed?: string | null;
  result?: string | null;
}

export interface BuildDocumentInput {
  record: SterunRecord;
  event: SterunEvent;
  category: SterunCategory;
  owner: string;
  network: { passphrase: string; eventRegistry: string; raceRecord: string };
  transactions?: RecordProvenance;
}

/**
 * Explorer base for a network passphrase.
 *
 * Derived rather than configured because the passphrase already *is* the
 * network's identity — carrying a second, independently settable field for the
 * same fact invites the two to disagree, and a link to the wrong network's
 * explorer is a confidently wrong 404.
 */
export function explorerBase(passphrase: string): string {
  if (passphrase === "Public Global Stellar Network ; September 2015") {
    return "https://stellar.expert/explorer/public";
  }
  if (passphrase === "Test SDF Future Network ; October 2022") {
    return "https://stellar.expert/explorer/futurenet";
  }
  return "https://stellar.expert/explorer/testnet";
}

/**
 * Build the document, then validate it before returning.
 *
 * Validating our own output looks redundant and is not: this is the one place
 * the schema and the code that fills it could disagree, and a document that
 * fails validation at the consumer is far more expensive than one that fails
 * here. It costs microseconds and removes a whole class of "the SDK emitted
 * something its own schema rejects" bug.
 */
export function buildRaceRecordDocument(input: BuildDocumentInput): RaceRecordDocument {
  const { record, event, category, owner, network } = input;
  const base = explorerBase(network.passphrase);

  const document = {
    schema_version: RACE_RECORD_SCHEMA_VERSION,
    network: {
      passphrase: network.passphrase,
      event_registry: network.eventRegistry,
      race_record: network.raceRecord,
    },
    token_id: record.tokenId,
    owner,
    bib_no: record.bibNo,
    participant_hash: record.participantHash,
    state: record.state,
    event: {
      event_id: event.eventId,
      name: event.name,
      organiser: event.organiser,
      uri: event.uri,
      metadata_hash: event.metadataHash,
      starts_at: event.startsAt.toString(),
      status: event.status,
    },
    category: {
      category_id: category.categoryId,
      code: category.code,
      distance_m: category.distanceM,
      quota: category.quota,
      entered_count: category.enteredCount,
      price_stroops: category.priceStroops.toString(),
    },
    timings: {
      entered_at: record.enteredAt.toString(),
      claimed_at: record.claimedAt === null ? null : record.claimedAt.toString(),
      finish_time_s: record.finishTimeS,
      result_at: record.resultAt === null ? null : record.resultAt.toString(),
    },
    links: {
      record_contract: `${base}/contract/${network.raceRecord}`,
      owner_account: `${base}/account/${owner}`,
      transactions: {
        entered: input.transactions?.entered ?? null,
        claimed: input.transactions?.claimed ?? null,
        result: input.transactions?.result ?? null,
      },
    },
  };

  return raceRecordDocumentSchema.parse(document);
}
