/**
 * What a volunteer's phone keeps. Backed by fake-indexeddb (test/setup.ts), so
 * the real idb-keyval code runs. Each test uses its own event id, because the
 * database outlives a single test.
 */
import { describe, expect, it } from "vitest";

import {
  enqueueClaim,
  listClaims,
  listRosters,
  markClaim,
  readRoster,
  saveRoster,
  type QueuedClaim,
  type StoredRoster,
} from "@/modules/scanner/lib/scanner-store";

function rosterFor(eventId: number, bibs: number[]): StoredRoster {
  return {
    eventId,
    raceName: "Sasando Run 2026",
    categories: [{ categoryId: 0, code: "10K" }],
    snapshotLedger: 612_400,
    generatedAt: "2026-09-27T00:10:00.000Z",
    downloadedAt: "2026-09-27T00:10:02.000Z",
    driftSeconds: 2,
    totp: { digits: 6, stepSeconds: 30, toleranceSteps: 1 },
    entries: bibs.map((bibNo, index) => ({
      tokenId: eventId * 100 + index,
      bibNo,
      categoryId: 0,
      state: "Entered",
      nameFragment: "Budi S.",
      addOns: [{ item: "Event jersey", choice: "L" }],
      totpSecret: "9c1f0a7d4e2b63859f0d17c4a6e28b30d5f74196ac30e5b82f6d1904c7ba3e58",
    })),
  };
}

function claim(eventId: number, tokenId: number, scannedAt: string): QueuedClaim {
  return { eventId, tokenId, bibNo: tokenId, scannedAt, status: "waiting" };
}

describe("the roster", () => {
  it("reads back exactly what was saved", async () => {
    const roster = rosterFor(1, [1, 2, 3]);
    await saveRoster(roster);
    expect(await readRoster(1)).toEqual(roster);
  });

  it("answers undefined for an event this phone never downloaded", async () => {
    expect(await readRoster(9_999)).toBeUndefined();
  });

  it("keeps one roster per event, and a new download replaces the old one whole", async () => {
    await saveRoster(rosterFor(2, [1, 2]));
    await saveRoster(rosterFor(3, [7]));
    await saveRoster(rosterFor(2, [1, 2, 3, 4]));

    expect((await readRoster(2))?.entries).toHaveLength(4);
    expect((await readRoster(3))?.entries).toHaveLength(1);
    const ids = (await listRosters()).map((roster) => roster.eventId);
    expect(ids).toEqual(expect.arrayContaining([2, 3]));
  });

  it("holds no field that could be a full name", async () => {
    await saveRoster(rosterFor(4, [1]));
    const stored = await readRoster(4);

    // Every key at every depth. `nameFragment` is the reduced form and
    // `raceName` names a race, not a person; a bare `name`, `fullName` or
    // `bibName` is not allowed.
    const keys: string[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") {
        for (const [key, inner] of Object.entries(value)) {
          keys.push(key);
          walk(inner);
        }
      }
    };
    walk(stored);

    expect(keys.filter((key) => /name/i.test(key) && !["nameFragment", "raceName"].includes(key))).toEqual([]);
  });
});

describe("the claims", () => {
  it("lists one event's claims in the order they were handed over", async () => {
    await enqueueClaim(claim(10, 1003, "2026-09-27T01:00:03.000Z"));
    await enqueueClaim(claim(10, 1001, "2026-09-27T01:00:01.000Z"));
    await enqueueClaim(claim(11, 1100, "2026-09-27T01:00:00.000Z"));
    await enqueueClaim(claim(10, 1002, "2026-09-27T01:00:02.000Z"));

    expect((await listClaims(10)).map((row) => row.tokenId)).toEqual([1001, 1002, 1003]);
    expect((await listClaims(11)).map((row) => row.tokenId)).toEqual([1100]);
  });

  it("keeps the first row when the same token is queued twice", async () => {
    await enqueueClaim(claim(12, 1200, "2026-09-27T01:00:00.000Z"));
    await enqueueClaim({ ...claim(12, 1200, "2026-09-27T02:00:00.000Z"), status: "refused" });

    const rows = await listClaims(12);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ scannedAt: "2026-09-27T01:00:00.000Z", status: "waiting" });
  });

  it("records what the chain did with a claim, keeping when it was scanned", async () => {
    await enqueueClaim(claim(13, 1300, "2026-09-27T01:00:00.000Z"));
    await enqueueClaim(claim(13, 1301, "2026-09-27T01:00:01.000Z"));

    await markClaim(1300, { status: "sent", txHash: "a".repeat(64), ledger: 4_469_902 });
    await markClaim(1301, { status: "refused", reason: "already-claimed", claimedAt: "1790000000" });

    expect(await listClaims(13)).toEqual([
      { ...claim(13, 1300, "2026-09-27T01:00:00.000Z"), status: "sent", txHash: "a".repeat(64), ledger: 4_469_902 },
      {
        ...claim(13, 1301, "2026-09-27T01:00:01.000Z"),
        status: "refused",
        reason: "already-claimed",
        claimedAt: "1790000000",
      },
    ]);
  });

  it("does not invent a claim this phone never recorded, and the queue still lists", async () => {
    await enqueueClaim(claim(14, 1400, "2026-09-27T01:00:00.000Z"));
    await markClaim(9_997_000, { status: "sent" });

    // idb-keyval's update writes whatever its updater returns, undefined too,
    // and an undefined row used to make this listing throw.
    expect((await listClaims(14)).map((row) => row.tokenId)).toEqual([1400]);
  });

  it("answers an empty list for an event with no claims", async () => {
    expect(await listClaims(9_998)).toEqual([]);
  });
});
