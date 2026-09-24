import { describe, expect, it } from "vitest";

import {
  planBatches,
  promptSentence,
  publishablePlan,
  toResult,
  withoutRecorded,
} from "../lib/publish-results";
import type { ResultsReview, ReviewedRow } from "../lib/results-preview";

function row(overrides: Partial<ReviewedRow> = {}): ReviewedRow {
  return {
    line: 2,
    bibNo: 1,
    categoryId: 0,
    finishTimeS: 3161,
    kind: "timed",
    tokenId: 10,
    state: "RacepackClaimed",
    anomalies: [],
    ...overrides,
  };
}

function rows(count: number): ReviewedRow[] {
  return Array.from({ length: count }, (_, index) =>
    row({ line: index + 2, bibNo: index + 1, tokenId: index + 1 }),
  );
}

describe("publish-results", () => {
  describe("positive", () => {
    it("maps each kind to the call the contract has for it", () => {
      expect(toResult(row({ tokenId: 7, kind: "timed", finishTimeS: 3161 }))).toEqual({
        tokenId: 7,
        kind: "timed",
        finishTimeS: 3161,
      });
      // A fun run finisher: no time is a result, not a missing one.
      expect(toResult(row({ tokenId: 8, kind: "untimed", finishTimeS: null }))).toEqual({
        tokenId: 8,
        kind: "untimed",
      });
      expect(toResult(row({ tokenId: 9, kind: "dnf", finishTimeS: null }))).toEqual({
        tokenId: 9,
        kind: "dnf",
      });
    });

    it("counts runners, not file lines, so held rows do not leave gaps", () => {
      // Lines 2 and 3 were held; the survivors are still runners 1 and 2.
      const batches = planBatches([row({ line: 4, tokenId: 1 }), row({ line: 9, tokenId: 2 })], 5);

      expect(batches).toHaveLength(1);
      expect(batches[0]!.label).toBe("Runners 1 to 2");
    });

    it("splits into batches the contract will accept, in file order", () => {
      const batches = planBatches(rows(7), 3);

      expect(batches.map((batch) => batch.label)).toEqual([
        "Runners 1 to 3",
        "Runners 4 to 6",
        "Runner 7",
      ]);
      expect(batches.flatMap((batch) => batch.results.map((result) => result.tokenId))).toEqual([
        1, 2, 3, 4, 5, 6, 7,
      ]);
    });

    it("plans from the publishable rows only, never from the whole file", () => {
      const review = {
        rows: [row({ tokenId: 1 }), row({ tokenId: 2, anomalies: [{ kind: "unknown_bib", reason: "x", severity: "reverts" }] })],
        publishable: [row({ tokenId: 1 })],
        counts: { publishable: 1, total: 2 },
      } as unknown as ResultsReview;

      const batches = publishablePlan(review, 10);

      expect(batches.flatMap((batch) => batch.results.map((result) => result.tokenId))).toEqual([1]);
    });

    it("says how many times the wallet will ask, in the wizard's words", () => {
      expect(promptSentence(planBatches(rows(1), 3))).toBe("Your wallet will ask you once");
      expect(promptSentence(planBatches(rows(7), 3))).toBe("Your wallet will ask you 3 times");
    });

    it("drops runners the chain already recorded when a stopped run continues", () => {
      // The transaction landed; the browser never heard it.
      const left = withoutRecorded(rows(4), new Set([1, 2]));

      expect(left.map((entry) => entry.tokenId)).toEqual([3, 4]);
    });
  });

  describe("negative", () => {
    it("refuses a row with no record rather than inventing one", () => {
      expect(() => toResult(row({ tokenId: null }))).toThrow(/not publishable/);
      expect(() => toResult(row({ kind: null }))).toThrow(/not publishable/);
    });

    it("refuses a timed row with no time, which would publish a zero", () => {
      expect(() => toResult(row({ kind: "timed", finishTimeS: null }))).toThrow(/no time/);
    });

    it("plans nothing from an empty file rather than a batch of nothing", () => {
      expect(planBatches([], 5)).toEqual([]);
    });

    it("refuses a batch size the contract would not take", () => {
      expect(() => planBatches(rows(2), 0)).toThrow(RangeError);
      expect(() => planBatches(rows(2), 121)).toThrow(RangeError);
    });
  });
});
