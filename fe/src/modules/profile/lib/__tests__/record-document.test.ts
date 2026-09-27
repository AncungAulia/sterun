/**
 * Every record state the page can draw produces a document that passes the
 * frozen JSON Schema v1.0. `buildRaceRecordDocument` throws when it does not, so
 * each case below is the schema's own verdict, not ours.
 */
import { describe, expect, it } from "vitest";

import { recordDocument } from "@/modules/profile/lib/record-document";

import { RUNNER, category, event, record, summary } from "./fixtures";

const race = summary(event(3, "Merdeka Run 2026", "Completed", 1_790_000_000n), [category(3, 0, "10K", 10_000)]);

describe("recordDocument", () => {
  it.each([
    ["entered", record({ tokenId: 1, eventId: 3 })],
    ["collected", record({ tokenId: 2, eventId: 3, state: "RacepackClaimed", claimedAt: 1_789_990_000n })],
    [
      "finished with a time",
      record({ tokenId: 3, eventId: 3, state: "Finished", claimedAt: 1_789_990_000n, finishTimeS: 6729, resultAt: 1_790_020_000n }),
    ],
    [
      "finished with no official time",
      record({ tokenId: 4, eventId: 3, state: "Finished", claimedAt: 1_789_990_000n, finishTimeS: null, resultAt: 1_790_020_000n }),
    ],
    ["did not finish", record({ tokenId: 5, eventId: 3, state: "Dnf", claimedAt: 1_789_990_000n, resultAt: 1_790_020_000n })],
    ["did not start", record({ tokenId: 6, eventId: 3, state: "Dnf", resultAt: 1_790_020_000n })],
  ])("is a valid document for a record that %s", (_label, rec) => {
    const document = recordDocument(rec, race, RUNNER);

    expect(document).not.toBeNull();
    expect(document!.token_id).toBe(rec.tokenId);
    expect(document!.timings.finish_time_s).toBe(rec.finishTimeS);
    expect(document!.links.record_contract).toMatch(/^https:\/\/stellar\.expert\/explorer\/testnet\/contract\/C/);
  });

  it("carries a transaction the index knows about", () => {
    const document = recordDocument(record({ tokenId: 7, eventId: 3 }), race, RUNNER, { entered: "c".repeat(64) });
    expect(document!.links.transactions.entered).toBe("c".repeat(64));
  });

  it("has no document when the race or its category could not be read", () => {
    expect(recordDocument(record({ tokenId: 8, eventId: 3 }), null, RUNNER)).toBeNull();
    expect(recordDocument(record({ tokenId: 9, eventId: 3, categoryId: 5 }), race, RUNNER)).toBeNull();
  });
});
