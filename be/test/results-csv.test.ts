/**
 * STE-20 — reading a results file a human produced.
 *
 * The expensive mistake this file guards against is `52:41` being read as 5241
 * seconds instead of 3161. `record_finish` moves a record to `Finished`, which
 * is terminal, so that row would publish a time wrong by 35 minutes with no way
 * back. Most of what follows is that one class of bug, approached from
 * different directions.
 */
import { describe, expect, it } from "vitest";
import { CsvFormatError, parseFinishTime, parseResultsCsv } from "../src/results/csv.js";

describe("finish times", () => {
  it.each([
    ["3161", 3161],
    ["0", 0],
    ["52:41", 3161],
    ["1:02:41", 3761],
    ["02:52:41", 10361],
    ["9:59", 599],
  ])("reads %o as %i seconds", (input, expected) => {
    expect(parseFinishTime(input)).toBe(expected);
  });

  it("does not read a duration as a plain number", () => {
    // The whole point. 52:41 is 3161 seconds, and 5241 would be a published
    // result 35 minutes slow that nobody can correct.
    expect(parseFinishTime("52:41")).toBe(3161);
    expect(parseFinishTime("52:41")).not.toBe(5241);
  });

  it("truncates fractional seconds rather than rounding them", () => {
    // The contract stores whole seconds. Rounding 3161.6 up to 3162 would
    // invent a result nobody timed.
    expect(parseFinishTime("3161.6")).toBe(3161);
    expect(parseFinishTime("52:41.9")).toBe(3161);
  });

  it("tolerates the whitespace a spreadsheet leaves behind", () => {
    expect(parseFinishTime("  3161  ")).toBe(3161);
    expect(parseFinishTime("\t52:41")).toBe(3161);
  });

  it.each(["", "   ", "abc", "52:61", "1:2:3:4", "-60", "1e3", "52,41", "12:99"])(
    "refuses %o rather than guessing",
    (input) => {
      // 52:61 is the one worth naming: a minutes field above 59 is a typo, and
      // silently reading it as 3181 seconds would be a wrong published time.
      expect(parseFinishTime(input)).toBeNull();
    },
  );
});

describe("the file as a whole", () => {
  it("parses the plain two-column file the ticket describes", () => {
    const csv = "bib_no,finish_time\n0,3161\n1,52:41\n";
    const parsed = parseResultsCsv(csv);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({ line: 2, bibNo: 0, finishTimeS: 3161, problem: null });
    expect(parsed.rows[1]).toMatchObject({ line: 3, bibNo: 1, finishTimeS: 3161, problem: null });
  });

  it.each([
    "Bib No,Finish Time",
    "BIB,TIME",
    "bib_number,chip_time",
    "number,net_time",
    "bib,duration",
  ])("accepts the header %o", (header) => {
    // Rejecting a file because a volunteer's export said "Bib No" helps nobody,
    // and they will retype it by hand, which is how transcription errors start.
    expect(parseResultsCsv(`${header}\n7,3161\n`).rows[0]).toMatchObject({
      bibNo: 7,
      finishTimeS: 3161,
    });
  });

  it("reads the optional category column", () => {
    const parsed = parseResultsCsv("bib_no,category_id,finish_time\n0,1,3161\n");
    expect(parsed.rows[0]).toMatchObject({ bibNo: 0, categoryId: 1, finishTimeS: 3161 });
  });

  it("leaves category null when the file does not say", () => {
    expect(parseResultsCsv("bib,time\n0,3161\n").rows[0]?.categoryId).toBeNull();
  });

  it("handles a semicolon-delimited export from a European Excel", () => {
    const parsed = parseResultsCsv("bib_no;finish_time\n4;52:41\n");
    expect(parsed.rows[0]).toMatchObject({ bibNo: 4, finishTimeS: 3161 });
  });

  it("survives CRLF and a UTF-8 BOM", () => {
    const parsed = parseResultsCsv("﻿bib_no,finish_time\r\n0,3161\r\n");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ bibNo: 0, finishTimeS: 3161, problem: null });
  });

  it("honours quoted cells", () => {
    const parsed = parseResultsCsv('bib_no,finish_time\n"12","52:41"\n');
    expect(parsed.rows[0]).toMatchObject({ bibNo: 12, finishTimeS: 3161 });
  });

  it("skips blank lines and # comments without counting them as rows", () => {
    const parsed = parseResultsCsv("# exported 2026-10-01\nbib_no,time\n\n0,3161\n\n# end\n");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.skipped).toBe(3);
  });

  it("reports a bad row as a row, not as a failed file", () => {
    // An organiser needs to see the bad line next to the good ones. Failing the
    // whole upload on one typo means they fix it blind and upload again.
    const parsed = parseResultsCsv("bib_no,time\n0,3161\nxx,3161\n2,nope\n");
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]?.problem).toBeNull();
    expect(parsed.rows[1]?.problem).toMatch(/bib number .* is not a whole number/);
    expect(parsed.rows[2]?.problem).toMatch(/finish time .* is not a number of seconds/);
  });

  it("keeps the original line and its number so a human can find it", () => {
    const parsed = parseResultsCsv("bib_no,time\n0,3161\nxx,3161\n");
    expect(parsed.rows[1]).toMatchObject({ line: 3, raw: "xx,3161" });
  });

  it("nulls every field of a row it could not read, rather than half-reading it", () => {
    const row = parseResultsCsv("bib_no,time\nxx,3161\n").rows[0];
    expect(row).toMatchObject({ bibNo: null, finishTimeS: null, categoryId: null });
  });

  it.each([
    ["an empty file", ""],
    ["only comments", "# nothing here\n"],
    ["a header with no bib column", "runner,time\nA,3161\n"],
    ["a header with no time column", "bib_no,category_id\n0,1\n"],
  ])("refuses %s at the file level", (_label, csv) => {
    expect(() => parseResultsCsv(csv)).toThrow(CsvFormatError);
  });

  it("says what the header should have looked like", () => {
    // The error a human reads at 6am on race day should tell them the fix.
    expect(() => parseResultsCsv("runner,time\nA,1\n")).toThrow(/bib_no\/bib\/number/);
  });
});

/**
 * STE-44 — rows that are not a timed finish.
 *
 * A fun run has finishers with no official time, and every race has runners
 * who did not finish. All three outcomes are terminal on chain, so the rule
 * throughout is: a row says what it is, and anything contradictory or unknown
 * is refused rather than resolved.
 */
describe("the status column", () => {
  it("reads finished, untimed and dnf as three kinds", () => {
    const rows = parseResultsCsv("bib_no,finish_time,status\n0,52:41,finished\n1,,untimed\n2,,dnf\n")
      .rows;
    expect(rows.map((r) => [r.kind, r.finishTimeS, r.problem])).toEqual([
      ["timed", 3161, null],
      ["untimed", null, null],
      ["dnf", null, null],
    ]);
  });

  it("treats a row with a time and no status as timed, so old files mean what they meant", () => {
    expect(parseResultsCsv("bib_no,finish_time\n0,3161\n").rows[0]).toMatchObject({
      kind: "timed",
      finishTimeS: 3161,
    });
  });

  it.each([
    ["Finished", "timed", "3161"],
    ["no time", "untimed", ""],
    ["No-Official-Time", "untimed", ""],
    ["DNF", "dnf", ""],
    ["did not finish", "dnf", ""],
    ["DNS", "dnf", ""],
    ["no show", "dnf", ""],
  ])("accepts the status %o as %s", (status, kind, time) => {
    expect(parseResultsCsv(`bib,time,result\n7,${time},${status}\n`).rows[0]).toMatchObject({
      kind,
      problem: null,
    });
  });

  it("accepts a fun run file with a status column and no time column at all", () => {
    const parsed = parseResultsCsv("bib_no,status\n0,untimed\n1,dnf\n");
    expect(parsed.rows.map((r) => r.kind)).toEqual(["untimed", "dnf"]);
  });

  it.each(["untimed", "dnf"])("refuses a %s row that still carries a time", (status) => {
    // Keeping the time contradicts the status; dropping it throws away a time
    // someone measured. Neither is a decision the parser gets to make.
    const row = parseResultsCsv(`bib_no,finish_time,status\n0,52:41,${status}\n`).rows[0];
    expect(row).toMatchObject({ kind: null, finishTimeS: null, bibNo: null });
    expect(row?.problem).toMatch(/must leave the finish time empty/);
  });

  it("refuses a status it does not know, rather than reading it as a finish", () => {
    const row = parseResultsCsv("bib_no,finish_time,status\n0,3161,DQ\n").rows[0];
    expect(row?.kind).toBeNull();
    expect(row?.problem).toMatch(/status "DQ" is not one of finished, untimed or dnf/);
  });

  it("points a finished row with no time at the untimed status", () => {
    const row = parseResultsCsv("bib_no,finish_time,status\n0,,finished\n").rows[0];
    expect(row?.problem).toMatch(/write untimed in the status column/);
  });

  it("does not infer untimed from an empty time with no status", () => {
    // A blank cell is far likelier a missed keystroke than a declared untimed
    // finish, and both are permanent.
    const row = parseResultsCsv("bib_no,finish_time,status\n0,,\n").rows[0];
    expect(row?.kind).toBeNull();
    expect(row?.problem).toMatch(/finish time "" is not a number of seconds/);
  });

  it("still refuses a file that names neither a time nor a status column", () => {
    expect(() => parseResultsCsv("bib_no,category_id\n0,1\n")).toThrow(/time or status column/);
  });
});
