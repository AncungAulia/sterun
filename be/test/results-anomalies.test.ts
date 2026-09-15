/**
 * STE-20 — which rows are safe to publish, and which are not.
 *
 * The ticket names four anomalies. There are seven here, and the two extra ones
 * are the interesting part:
 *
 *   ambiguous_bib   before contracts v2.3 bib numbers restart in every category, because
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

  it("duplicate_bib — the same runner twice in one file, and NEITHER row is publishable", () => {
    const result = review("bib_no,category_id,finish_time\n0,0,3161\n0,0,3200\n");
    // Both rows, not just the repeat: which time is right is unknown, and a
    // Finished result is terminal. The first row used to be published.
    expect(kinds(result, 2)).toEqual(["duplicate_bib"]);
    expect(kinds(result, 3)).toEqual(["duplicate_bib"]);
    // Each points at the other, so the organiser can compare the two.
    expect(result.rows[0]?.anomalies[0]?.reason).toMatch(/again on line 3/);
    expect(result.rows[1]?.anomalies[0]?.reason).toMatch(/line 2/);
    expect(result.counts.publishable).toBe(0);
    expect(result.publishable).toEqual([]);
  });

  it("flags the first row once, however many times the bib repeats", () => {
    const result = review("bib_no,category_id,finish_time\n0,0,3161\n0,0,3200\n0,0,3300\n");
    expect(kinds(result, 2)).toEqual(["duplicate_bib"]);
    expect(result.counts.duplicate_bib).toBe(3);
    expect(result.counts.publishable).toBe(0);
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
      // Lines 2 and 3 are the same bib twice, so neither is publishable.
      publishable: 0,
      duplicate_bib: 2,
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

/**
 * STE-44 — untimed finishes and DNFs.
 *
 * They share the checks about the record and differ where the contract does:
 * record_finish_untimed refuses an unclaimed record like record_finish, while
 * record_dnf is allowed straight from Entered (a no-show is exactly the runner
 * who never came for a race pack).
 */
describe("untimed finishes and DNFs", () => {
  const MIXED =
    "bib_no,category_id,finish_time,status\n" +
    "0,0,52:41,finished\n" + // token 10, RacepackClaimed
    "1,0,,untimed\n" + // token 11, RacepackClaimed
    "2,0,,dnf\n"; // token 12, Entered — a no-show

  it("previews a mixed file with each row's kind, and publishes all three", () => {
    const result = review(MIXED);
    expect(result.rows.map((r) => [r.tokenId, r.kind, r.anomalies.length])).toEqual([
      [10, "timed", 0],
      [11, "untimed", 0],
      [12, "dnf", 0],
    ]);
    expect(result.publishable.map((r) => [r.tokenId, r.kind, r.finishTimeS])).toEqual([
      [10, "timed", 3161],
      [11, "untimed", null],
      [12, "dnf", null],
    ]);
  });

  it("flags an untimed row for a runner who never collected a race pack", () => {
    const result = review("bib_no,category_id,status\n2,0,untimed\n");
    expect(kinds(result, 2)).toEqual(["not_claimed"]);
    expect(result.rows[0]?.anomalies[0]?.reason).toMatch(/record_finish_untimed reverts/);
    expect(result.rows[0]?.anomalies[0]?.severity).toBe("reverts");
  });

  it("does NOT flag a DNF for a runner who never collected a race pack", () => {
    expect(kinds(review("bib_no,category_id,status\n2,0,dnf\n"), 2)).toEqual([]);
  });

  it.each(["untimed", "dnf"])("refuses a %s row over a result that is already final", (status) => {
    // tokens 13 (Finished) and 14 (Dnf) are terminal on chain.
    const result = review(`bib_no,category_id,status\n3,0,${status}\n4,0,${status}\n`);
    expect(kinds(result, 2)).toEqual(["already_final"]);
    expect(kinds(result, 3)).toEqual(["already_final"]);
  });

  it("never judges the time of a row that has none", () => {
    // impossible_time is about a measured time; running it on an untimed row
    // would either crash or invent a zero-second finish.
    const result = review("bib_no,category_id,status\n1,0,untimed\n0,1,dnf\n");
    expect(result.counts.impossible_time).toBe(0);
  });

  it("counts the same runner twice as a duplicate even when the two rows disagree on kind", () => {
    // A finish time and a DNF for one runner: at most one is true, and nothing
    // says which, so neither row may be published.
    const result = review("bib_no,category_id,finish_time,status\n0,0,3161,\n0,0,,dnf\n");
    expect(kinds(result, 2)).toEqual(["duplicate_bib"]);
    expect(kinds(result, 3)).toEqual(["duplicate_bib"]);
    expect(result.publishable).toEqual([]);
  });

  it("keeps a contradictory row out of publishable as malformed", () => {
    const result = review("bib_no,category_id,finish_time,status\n1,0,52:41,untimed\n");
    expect(kinds(result, 2)).toEqual(["malformed_row"]);
    expect(result.rows[0]?.kind).toBeNull();
    expect(result.publishable).toEqual([]);
  });
});
