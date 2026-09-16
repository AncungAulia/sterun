/**
 * Why `enter` did not go through, told from the ledger rather than the error
 * code, because the sUSD token shares EventRegistry's error band.
 */
import { describe, expect, it } from "vitest";

import { classifyEnterFailure, type ChainAfter } from "@/modules/entry/lib/enter-failure";

const healthy: ChainAfter = {
  status: "Open",
  slotsLeft: 5,
  soldOutAddOns: [],
  balance: { kind: "balance", stroops: 1_000n },
  total: 500n,
};

/** What an `enter` refusal looks like from outside: a code with no contract identity. */
const refusal = new Error("enter reverted with Error(Contract, #10)");

describe("classifyEnterFailure", () => {
  describe("read from the error, before the chain", () => {
    it("reads a decline", () => {
      expect(classifyEnterFailure(new Error("User declined the request"), healthy)).toEqual({
        kind: "declined",
      });
    });

    it("reads a wallet's object-shaped decline", () => {
      expect(classifyEnterFailure({ error: { code: -4, message: "User rejected" } }, null)).toEqual({
        kind: "declined",
      });
    });

    it("reads no answer, even when the chain now looks full", () => {
      expect(
        classifyEnterFailure(new Error("enter returned no transaction hash"), {
          ...healthy,
          slotsLeft: 0,
        }),
      ).toEqual({ kind: "no-answer" });
    });

    it("does not call it a decline when the text says it was already submitted", () => {
      expect(
        classifyEnterFailure(new Error("rejected after it was submitted"), healthy).kind,
      ).not.toBe("declined");
    });
  });

  describe("explained by what the chain says afterwards", () => {
    it("closed wins over everything the chain also says", () => {
      expect(
        classifyEnterFailure(refusal, {
          ...healthy,
          status: "Closed",
          slotsLeft: 0,
          balance: { kind: "no-trustline" },
        }),
      ).toEqual({ kind: "closed" });
    });

    it("then a distance with no places", () => {
      expect(
        classifyEnterFailure(refusal, { ...healthy, slotsLeft: 0, soldOutAddOns: ["Event jersey"] }),
      ).toEqual({ kind: "sold-out" });
    });

    it("then a reserved item with no units, named", () => {
      expect(
        classifyEnterFailure(refusal, { ...healthy, soldOutAddOns: ["Event jersey", "Towel"] }),
      ).toEqual({ kind: "add-on-sold-out", names: ["Event jersey", "Towel"] });
    });

    it("then a balance that does not cover the total, with how much is missing", () => {
      expect(
        classifyEnterFailure(refusal, { ...healthy, balance: { kind: "balance", stroops: 200n } }),
      ).toEqual({ kind: "short", needed: 300n });
    });

    it("counts a missing trustline as the whole total short", () => {
      expect(classifyEnterFailure(refusal, { ...healthy, balance: { kind: "no-trustline" } })).toEqual({
        kind: "short",
        needed: 500n,
      });
    });

    it("never calls a free entry short", () => {
      expect(
        classifyEnterFailure(refusal, { ...healthy, total: 0n, balance: { kind: "no-account" } }).kind,
      ).toBe("other");
    });
  });

  describe("when nothing explains it", () => {
    it("falls back to the plain sentence, not a guess", () => {
      expect(classifyEnterFailure(refusal, healthy)).toEqual({
        kind: "other",
        message: "Something went wrong. Please try again.",
      });
    });

    it("falls back when the chain could not be re-read", () => {
      expect(classifyEnterFailure(refusal, null)).toEqual({
        kind: "other",
        message: "Something went wrong. Please try again.",
      });
    });
  });
});
