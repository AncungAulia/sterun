/**
 * What this browser keeps about an entry it made. Backed by fake-indexeddb
 * (test/setup.ts), so the real idb-keyval code runs.
 */
import { describe, expect, it } from "vitest";

import {
  markReceiptSaved,
  readEntry,
  rememberPassFacts,
  saveEntry,
  type StoredEntry,
} from "@/lib/entry-store";

const entry: StoredEntry = {
  eventId: 1,
  categoryId: 0,
  tokenId: 42,
  bibNo: 0,
  bibName: "SARI",
  raceName: "Jogja 10K",
  startsAt: "1790548200",
  distanceCode: "10K",
  participantHash: "a".repeat(64),
  salt: "b".repeat(64),
  totpSecret: "c".repeat(64),
  txHash: "d".repeat(64),
  runner: "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR",
  enteredAt: "2026-09-15T01:00:00.000Z",
  participantId: "6f1c9a52-3c1b-4b5e-9d0e-2a1f3b4c5d6e",
};

describe("entry store", () => {
  it("reads back exactly what it saved", async () => {
    await saveEntry(entry);
    expect(await readEntry(42)).toEqual(entry);
  });

  it("answers undefined for a token this browser never entered", async () => {
    expect(await readEntry(999)).toBeUndefined();
  });

  it("keeps one entry per token, the latest save winning", async () => {
    await saveEntry({ ...entry, tokenId: 44, bibName: "OLD" });
    await saveEntry({ ...entry, tokenId: 44, bibName: "NEW" });
    expect((await readEntry(44))?.bibName).toBe("NEW");
  });

  it("remembers that the runner saved their receipt, and keeps the rest of the entry", async () => {
    await saveEntry({ ...entry, tokenId: 45 });

    await markReceiptSaved(45);

    const saved = await readEntry(45);
    expect(saved?.receiptSaved).toBe(true);
    expect(saved?.salt).toBe(entry.salt);
  });

  it("does nothing when marking a receipt it does not hold", async () => {
    await expect(markReceiptSaved(4321)).resolves.toBeUndefined();
    expect(await readEntry(4321)).toBeUndefined();
  });

  it("stores no personal details, by shape", () => {
    const keys = Object.keys(entry);
    for (const forbidden of ["name", "idNumber", "nationalId", "email", "phone", "dateOfBirth"]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

/**
 * The pass reads this store at a venue with no signal, so what the chain said
 * the last time there was signal has to survive here (STE-21 round 2).
 */
describe("what the pass remembers", () => {
  it("remembers what the pass needs to draw itself offline", async () => {
    await saveEntry({ ...entry, tokenId: 51 });

    await rememberPassFacts(51, { state: "RacepackClaimed", claimedAt: "1790548200", city: "Kupang" });

    const saved = await readEntry(51);
    expect(saved?.state).toBe("RacepackClaimed");
    expect(saved?.claimedAt).toBe("1790548200");
    expect(saved?.city).toBe("Kupang");
    // The entry itself is untouched: the pass only ever adds to it.
    expect(saved?.totpSecret).toBe(entry.totpSecret);
  });

  it("leaves out what it was not told, so one online visit cannot erase another's", async () => {
    await saveEntry({ ...entry, tokenId: 52 });

    await rememberPassFacts(52, { city: "Kupang" });
    await rememberPassFacts(52, { state: "Entered" });

    const saved = await readEntry(52);
    expect(saved?.city).toBe("Kupang");
    expect(saved?.state).toBe("Entered");
  });

  it("corrects the bib, which the chain owns and this device only copied", async () => {
    await saveEntry({ ...entry, tokenId: 53, bibNo: -1 });

    await rememberPassFacts(53, { bibNo: 128 });

    expect((await readEntry(53))?.bibNo).toBe(128);
  });

  it("does nothing for a token this device never entered", async () => {
    await expect(rememberPassFacts(9999, { state: "Entered" })).resolves.toBeUndefined();
    expect(await readEntry(9999)).toBeUndefined();
  });
});
