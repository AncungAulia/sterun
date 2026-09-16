/**
 * What the receipt says (mockup block 6). Pure, so a test can prove what it
 * leaves out: no personal details, and never the check-in secret.
 */
import { describe, expect, it } from "vitest";

import type { StoredEntry } from "@/lib/entry-store";
import { buildReceipt, maskCode } from "@/modules/entry/lib/receipt";

const EXPLORER = "https://stellar.expert/explorer/testnet";
const SALT = "a3f1c0d5e7b249168a0c4f2d9e6b8135c7a2049fbe31d68075c4e9a1b2f3d40e";
const SECRET = "c".repeat(64);

/** Midday UTC, so the calendar date is the same in every time zone a test runs in. */
const RACE_DAY = String(Date.UTC(2026, 10, 5, 12) / 1000);

const entry: StoredEntry = {
  eventId: 13,
  categoryId: 1,
  tokenId: 42,
  bibNo: 98,
  bibName: "BUDI",
  raceName: "Fun Run Sleman",
  startsAt: RACE_DAY,
  distanceCode: "10K",
  participantHash: "f".repeat(64),
  salt: SALT,
  totpSecret: SECRET,
  txHash: "9c1e".padEnd(64, "0"),
  runner: "GA5VKC7QHIIC7GBXMHLILU2LMKKXYAHOFNE77CUOGMLO4GB3ZKP5HZS7",
  enteredAt: "2026-09-15T12:00:00.000Z",
  racePack: ["Event jersey M", "Finisher medal", "Tumbler"],
  paidStroops: "2000000000",
};

const valueOf = (lines: { label: string; value: string }[], label: string) =>
  lines.find((line) => line.label === label)?.value;

describe("buildReceipt", () => {
  const receipt = buildReceipt(entry, EXPLORER);

  it("heads the page with the bib and the race", () => {
    expect(receipt.issuedOn).toBe("Issued Sep 15, 2026");
    expect(receipt.bibNo).toBe("98");
    expect(receipt.headline).toBe("Fun Run Sleman Â· 10K");
    expect(receipt.subline).toBe("Nov 5, 2026 Â· Bib name BUDI");
  });

  it("lists the record in the mockup's order", () => {
    expect(receipt.lines.map((line) => line.label)).toEqual([
      "Race record number",
      "Race pack",
      "Paid",
      "Wallet",
      "Identity fingerprint",
      "Transaction",
    ]);
    expect(valueOf(receipt.lines, "Race record number")).toBe("#42");
    expect(valueOf(receipt.lines, "Race pack")).toBe("Event jersey M, Finisher medal, Tumbler");
    expect(valueOf(receipt.lines, "Paid")).toBe("sUSD 200");
    expect(valueOf(receipt.lines, "Wallet")).toBe(entry.runner);
    expect(valueOf(receipt.lines, "Identity fingerprint")).toBe(entry.participantHash);
  });

  it("links the transaction on the explorer", () => {
    const transaction = receipt.lines.find((line) => line.label === "Transaction");
    expect(transaction?.href).toBe(`${EXPLORER}/tx/${entry.txHash}`);
  });

  it("carries the receipt code in full, apart from the lines", () => {
    expect(receipt.code).toBe(SALT);
    expect(receipt.fine).toContain("race record #42 belongs to you");
    expect(receipt.fine).toContain("It does not contain those details.");
  });

  it("never carries the check-in secret", () => {
    expect(JSON.stringify(receipt)).not.toContain(SECRET);
  });

  it("carries no personal detail", () => {
    const labels = receipt.lines.map((line) => line.label).join(" ");
    expect(labels).not.toMatch(/full name|identity (document|number)|email|phone|date of birth/i);
  });

  it("says Free for an entry that cost nothing", () => {
    expect(valueOf(buildReceipt({ ...entry, paidStroops: "0" }, EXPLORER).lines, "Paid")).toBe("Free");
  });

  it("leaves out what it does not know, rather than printing a blank", () => {
    const sparse = buildReceipt(
      { ...entry, txHash: "", racePack: undefined, paidStroops: undefined },
      EXPLORER,
    );
    const labels = sparse.lines.map((line) => line.label);
    expect(labels).not.toContain("Transaction");
    expect(labels).not.toContain("Race pack");
    expect(labels).not.toContain("Paid");
  });

  it("leaves out the transaction link where there is no explorer", () => {
    expect(buildReceipt(entry, "").lines.map((line) => line.label)).not.toContain("Transaction");
  });
});

describe("maskCode", () => {
  it("shows the first and last eight characters", () => {
    expect(maskCode(SALT)).toBe("a3f1c0d5 â€¢â€¢â€¢â€¢ â€¢â€¢â€¢â€¢ b2f3d40e");
  });
});
