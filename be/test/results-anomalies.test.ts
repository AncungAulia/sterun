/**
 * STE-20 — which rows are safe to publish, and which are not.
 *
 * The ticket names four anomalies. There are seven here, and the two extra ones
 * are the interesting part:
 *
 *   ambiguous_bib   bib numbers restart at 0 in every category, because
 *                   `reserve_slot` returns the *category's* entered_count. A
 *                   file of (bib, time) is therefore ambiguous the moment an
 *                   event has two categories, and guessing would publish one
 *                   runner's time onto another runner's record.
 *   already_final   split out from "not RacepackClaimed" because the two mean
 *                   different things to an organiser: one is "check them in
 *                   first", the other is "this is done and cannot be redone".
 *
 * Severity matters more than the count. A row that `reverts` costs a failed
 * transaction; a row that is `wrong` is accepted by the chain and is a lie
 * forever, because `Finished` is terminal.
 */
import { describe, expect, it } from "vitest";
import { parseResultsCsv } from "../src/results/csv.js";
import {
  MAX_PLAUSIBLE_FINISH_S,
  reviewResults,
  type CategoryDistance,
  type IndexedRecord,
} from "../src/results/anomalies.js";

/** Two categories, both starting their bib numbering at 0 — as the contract does. */
const RECORDS: IndexedRecord[] = [
  { tokenId: 10, categoryId: 0, bibNo: 0, state: "RacepackClaimed" },
  { tokenId: 11, categoryId: 0, bibNo: 1, state: "RacepackClaimed" },
  { tokenId: 12, categoryId: 0, bibNo: 2, state: "Entered" },
  { tokenId: 13, categoryId: 0, bibNo: 3, state: "Finished" },
  { tokenId: 14, categoryId: 0, bibNo: 4, state: "Dnf" },
  { tokenId: 20, categoryId: 1, bibNo: 0, state: "RacepackClaimed" },
];

const CATEGORIES: CategoryDistance[] = [
  { categoryId: 0, distanceM: 10_000 },
  { categoryId: 1, distanceM: 5_000 },
];

const review = (csv: string, records = RECORDS) =>
  reviewResults(parseResultsCsv(csv).rows, records, CATEGORIES);

const kinds = (r: ReturnType<typeof review>, line: number) =>
  r.rows.find((row) => row.line === line)?.anomalies.map((a) => a.kind) ?? [];

describe("a clean file", () => {
  it("resolves bibs to token ids and flags nothing", () => {
    const result = review("bib_no,category_id,finish_time\n0,0,3161\n1,0,52:41\n");
    expect(result.counts.total).toBe(2);
    expect(result.counts.publishable).toBe(2);
    expect(result.publishable.map((r) => r.tokenId)).toEqual([10, 11]);
    expect(result.publishable.map((r) => r.finishTimeS)).toEqual([3161, 3161]);
  });

  it("resolves a bib without a category when only one category claims it", () => {
    // bib 1 exists only in category 0, so there is nothing to disambiguate and
    // an organiser with unique bibs never has to add a column.
    const result = review("bib_no,finish_time\n1,3161\n");
    expect(kinds(result, 2)).toEqual([]);
    expect(result.publishable[0]?.tokenId).toBe(11);
  });
});

describe("the four anomalies the ticket names", () => {
  it("unknown_bib — no entry with that number", () => {
    const result = review("bib_no,finish_time\n99,3161\n");
    expect(kinds(result, 2)).toEqual(["unknown_bib"]);
    expect(result.rows[0]?.anomalies[0]?.severity).toBe("reverts");
    expect(result.rows[0]?.tokenId).toBeNull();
  });

  it("not_claimed — the runner never collected a race pack", () => {
    // record_finish requires RacepackClaimed; from Entered it reverts
    // InvalidState(103). The reason says what to do about it.
    const result = review("bib_no,category_id,finish_time\n2,0,3161\n");
    expect(kinds(result, 2)).toEqual(["not_claimed"]);
    expect(result.rows[0]?.anomalies[0]?.reason).toMatch(/Check them in first|mark a DNF/);
    expect(result.rows[0]?.anomalies[0]?.severity).toBe("reverts");
  });

  it("duplicate_bib — the same runner twice in one file", () => {
    const result = review("bib_no,category_id,finish_time\n0,0,3161\n0,0,3200\n");
    expect(kinds(result, 2)).toEqual([]);
    expect(kinds(result, 3)).toEqual(["duplicate_bib"]);
    // Points at the first occurrence, so the organiser can compare the two.
    expect(result.rows[1]?.anomalies[0]?.reason).toMatch(/line 2/);
    expect(result.counts.publishable).toBe(1);
  });

  it("impossible_time — a duration read as a plain number", () => {
    // 10km in 300s is 33 m/s. This is the shape of the mistake the parser
    // exists to prevent, caught again from the other side.
    const result = review("bib_no,category_id,finish_time\n0,0,300\n");
    expect(kinds(result, 2)).toEqual(["impossible_time"]);
    expect(result.rows[0]?.anomalies[0]?.severity).toBe("wrong");
    expect(result.rows[0]?.anomalies[0]?.reason).toMatch(/m\/s/);
  });
});

describe("the two the ticket does not name, and why they matter", () => {
  it("ambiguous_bib — bib 0 exists in both categories", () => {
    // Guessing here would publish the 5K runner's time onto the 10K runner's
    // record. Finished is terminal, so there is no undo.
    const result = review("bib_no,finish_time\n0,3161\n");
    expect(kinds(result, 2)).toEqual(["ambiguous_bib"]);
    expect(result.rows[0]?.anomalies[0]?.severity).toBe("wrong");
    expect(result.rows[0]?.anomalies[0]?.reason).toMatch(/categories 0, 1/);
    expect(result.rows[0]?.tokenId).toBeNull();
  });

  it("a category column resolves the same file cleanly", () => {
    expect(kinds(review("bib_no,category_id,finish_time\n0,1,900\n"), 2)).toEqual([]);
  });

  it("never fires when every bib is unique across the event", () => {
    const unique: IndexedRecord[] = [
      { tokenId: 10, categoryId: 0, bibNo: 100, state: "RacepackClaimed" },
      { tokenId: 20, categoryId: 1, bibNo: 200, state: "RacepackClaimed" },
    ];
    const result = review("bib_no,finish_time\n100,3161\n200,900\n", unique);
    expect(result.counts.ambiguous_bib).toBe(0);
    expect(result.counts.publishable).toBe(2);
  });

  it("already_final — Finished and Dnf are terminal", () => {
    const finished = review("bib_no,category_id,finish_time\n3,0,3161\n");
    const dnf = review("bib_no,category_id,finish_time\n4,0,3161\n");
    expect(kinds(finished, 2)).toEqual(["already_final"]);
    expect(kinds(dnf, 2)).toEqual(["already_final"]);
    expect(finished.rows[0]?.anomalies[0]?.reason).toMatch(/terminal/);
  });
});

describe("impossible times, from several directions", () => {
  it("rejects zero, which the contract rejects too", () => {
    const result = review("bib_no,category_id,finish_time\n0,0,0\n");
    expect(kinds(result, 2)).toEqual(["impossible_time"]);
    expect(result.rows[0]?.anomalies[0]?.reason).toMatch(/InvalidFinishTime/);
  });

  it("rejects anything past a day", () => {
    const result = review(`bib_no,category_id,finish_time\n0,0,${MAX_PLAUSIBLE_FINISH_S + 1}\n`);
    expect(kinds(result, 2)).toEqual(["impossible_time"]);
    expect(result.rows[0]?.anomalies[0]?.reason).toMatch(/24 hours/);
  });

  it("accepts a genuinely slow finish", () => {
    // Six hours for 10km is a walk, and a walk is a legitimate race result.
    // A check that flagged it would be retrained to be ignored.
    expect(kinds(review("bib_no,category_id,finish_time\n0,0,21600\n"), 2)).toEqual([]);
  });

  it("accepts a world-record pace without complaint", () => {
    // 10km in 26:11 (1571s) is 6.4 m/s — the actual world record. The threshold
    // is set to catch transcription errors, not to referee anybody's race.
    expect(kinds(review("bib_no,category_id,finish_time\n0,0,1571\n"), 2)).toEqual([]);
  });

  it("cannot judge speed for a row whose category never resolved", () => {
    // No record, no distance. Reporting a speed anomaly here would be inventing
    // a second complaint out of the first one.
    expect(kinds(review("bib_no,finish_time\n99,1\n"), 2)).toEqual(["unknown_bib"]);
  });
});

describe("rows can fail in more than one way at once", () => {
  it("reports every problem with a row rather than the first", () => {
    // Entered AND impossibly fast. An organiser who fixes only what they were
    // told will upload again and be told the next thing.
    const result = review("bib_no,category_id,finish_time\n2,0,10\n");
    expect(kinds(result, 2).sort()).toEqual(["impossible_time", "not_claimed"]);
  });

  it("counts each anomaly kind independently of the rows", () => {
    const result = review(
      "bib_no,category_id,finish_time\n0,0,3161\n0,0,3161\n99,0,3161\n2,0,3161\n",
    );
    expect(result.counts).toMatchObject({
      total: 4,
      publishable: 1,
      duplicate_bib: 1,
      unknown_bib: 1,
      not_claimed: 1,
    });
  });

  it("keeps a malformed row out of everything downstream", () => {
    const result = review("bib_no,finish_time\nxx,3161\n1,3161\n");
    expect(kinds(result, 2)).toEqual(["malformed_row"]);
    expect(result.counts.publishable).toBe(1);
    expect(result.publishable.map((r) => r.tokenId)).toEqual([11]);
  });

  it("treats two unresolvable rows with the same bib as duplicates too", () => {
    // Both are unknown, and both are also the same bib twice. Reporting only
    // the first problem would hide that the file itself is inconsistent.
    const result = review("bib_no,category_id,finish_time\n99,0,3161\n99,0,3161\n");
    expect(kinds(result, 3)).toContain("duplicate_bib");
  });
});

describe("what reaches `publishable`", () => {
  it("contains only rows with zero anomalies", () => {
    const result = review(
      "bib_no,category_id,finish_time\n0,0,3161\n2,0,3161\n3,0,3161\n1,0,3200\n",
    );
    expect(result.publishable.map((r) => r.tokenId)).toEqual([10, 11]);
  });

  it("carries exactly what record_finish needs", () => {
    const row = review("bib_no,category_id,finish_time\n0,0,3161\n").publishable[0];
    expect(row).toMatchObject({ tokenId: 10, finishTimeS: 3161, bibNo: 0, categoryId: 0 });
  });

  it("is empty when the file is empty of usable rows", () => {
    const result = review("bib_no,finish_time\n99,3161\n");
    expect(result.publishable).toEqual([]);
    expect(result.counts.publishable).toBe(0);
  });
});
