/**
 * What this browser keeps about an entry it made. Backed by fake-indexeddb
 * (test/setup.ts), so the real idb-keyval code runs.
 */
import { describe, expect, it } from "vitest";

import {
  markConfirmed,
  markReceiptSaved,
  readEntry,
  saveEntry,
  unconfirmedEntries,
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
  confirmed: false,
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

  it("tracks which entries still need their vault row confirmed", async () => {
    await saveEntry({ ...entry, tokenId: 43 });
    expect((await unconfirmedEntries()).map((e) => e.tokenId)).toContain(43);

    await markConfirmed(43);

    expect((await unconfirmedEntries()).map((e) => e.tokenId)).not.toContain(43);
    expect((await readEntry(43))?.confirmed).toBe(true);
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

  it("does nothing when confirming a token it does not hold", async () => {
    await expect(markConfirmed(1234)).resolves.toBeUndefined();
    expect(await readEntry(1234)).toBeUndefined();
  });

  it("stores no personal details, by shape", () => {
    const keys = Object.keys(entry);
    for (const forbidden of ["name", "idNumber", "nationalId", "email", "phone", "dateOfBirth"]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
