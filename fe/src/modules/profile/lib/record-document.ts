/**
 * A card's record as the frozen RaceRecord JSON document (schema v1.0, STE-19).
 *
 * STE-24 asks that what this page shows is valid against that schema. So the
 * card's contract link is read out of the document rather than built beside it:
 * `buildRaceRecordDocument` validates its own output and throws when it does
 * not match, which makes "the page and the document disagree" a failing test
 * instead of a card that quietly says something else.
 *
 * `null` when the record's category could not be read, since the document
 * requires it. The card still shows every chain fact it has.
 */
import { buildRaceRecordDocument, type RaceRecordDocument, type SterunRecord } from "@sterunxyz/sdk";

import { CONTRACTS, NETWORK } from "@/lib/chain/env";
import type { EventSummary } from "@/lib/event/events";

export function recordDocument(
  record: SterunRecord,
  summary: EventSummary | null,
  owner: string,
  transactions?: { entered?: string | null; claimed?: string | null; result?: string | null },
): RaceRecordDocument | null {
  const category = summary?.categories.find((candidate) => candidate.categoryId === record.categoryId);
  if (!summary || !category) return null;

  return buildRaceRecordDocument({
    record,
    event: summary.event,
    category,
    owner,
    network: {
      passphrase: NETWORK.networkPassphrase,
      eventRegistry: CONTRACTS.eventRegistry,
      raceRecord: CONTRACTS.raceRecord,
    },
    transactions,
  });
}
