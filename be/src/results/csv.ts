/**
 * STE-20 (C7) — reading a results CSV that a human produced.
 *
 * This file is the boundary between manual timing and the chain. What arrives
 * is a spreadsheet export typed by a volunteer at the finish line, and what
 * leaves is either a row we are prepared to defend on-chain or a flagged
 * anomaly. Being generous about *shape* and strict about *meaning* is the whole
 * job: rejecting a file because somebody wrote `Bib No` instead of `bib_no`
 * helps nobody, while accepting `52:41` as 5241 seconds would publish a wrong
 * result permanently, because `Finished` is terminal.
 *
 * ## Bib numbers are not unique within an event
 *
 * `EventRegistry::reserve_slot` returns the *category's* `entered_count` as the
 * bib sequence (sc/contracts/event_registry/src/lib.rs), so a 5K and a 10K in
 * the same event both start at bib 0. A file of `bib_no, finish_time` is
 * therefore ambiguous the moment an event has two categories, and resolving
 * that by picking the first match would publish somebody else's time.
 *
 * So `category_id` is an optional column. Without it a bib is resolved only if
 * exactly one category claims it; otherwise the row comes back as
 * `ambiguous_bib` for the organiser to disambiguate. Organisers who print
 * globally unique bibs never see it.
 */

/** What one parsed line means, before it is checked against the index. */
export interface ParsedRow {
  /** 1-based line number in the source file, for pointing a human at it. */
  line: number;
  /** The line as it appeared, for the same reason. */
  raw: string;
  bibNo: number | null;
  /** Present only when the file said so. */
  categoryId: number | null;
  finishTimeS: number | null;
  /** Set when the line could not be read at all; the fields above stay null. */
  problem: string | null;
}

export interface ParsedCsv {
  rows: ParsedRow[];
  /** Column names as they appeared, after normalisation. */
  header: string[];
  /** Rows the file contained but that carried no data (blank, comment). */
  skipped: number;
}

const HEADER_ALIASES: Record<string, "bib_no" | "category_id" | "finish_time_s"> = {
  bib: "bib_no",
  bib_no: "bib_no",
  bibno: "bib_no",
  bib_number: "bib_no",
  number: "bib_no",
  category: "category_id",
  category_id: "category_id",
  categoryid: "category_id",
  cat: "category_id",
  finish: "finish_time_s",
  finish_time: "finish_time_s",
  finish_time_s: "finish_time_s",
  finishtime: "finish_time_s",
  time: "finish_time_s",
  net_time: "finish_time_s",
  chip_time: "finish_time_s",
  duration: "finish_time_s",
};

const normaliseHeader = (cell: string): string =>
  cell
    .trim()
    .toLowerCase()
    .replace(/^﻿/, "") // Excel writes a BOM on the first cell.
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

/**
 * `52:41`, `1:02:41`, `3161`, `3161.4` -> seconds.
 *
 * All four are things timing software actually exports, and the difference
 * between reading `52:41` as 3161 and as 5241 is a published result that is
 * wrong by 35 minutes and cannot be corrected, because `record_finish` moves
 * the record to a terminal state.
 *
 * Fractional seconds are truncated, not rounded: the contract stores whole
 * seconds, and rounding 3161.6 up to 3162 would invent a result nobody timed.
 */
export function parseFinishTime(input: string): number | null {
  const value = input.trim();
  if (value === "") return null;

  const colon = /^(\d{1,3}):([0-5]?\d)(?::([0-5]?\d))?(?:\.(\d{1,3}))?$/.exec(value);
  if (colon) {
    const [, a = "0", b = "0", c, _frac] = colon;
    // Two parts are mm:ss; three are hh:mm:ss. Nothing else is meaningful.
    const seconds = c === undefined
      ? Number(a) * 60 + Number(b)
      : Number(a) * 3600 + Number(b) * 60 + Number(c);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }

  const plain = /^(\d+)(?:\.\d+)?$/.exec(value);
  if (plain?.[1]) {
    const seconds = Number(plain[1]);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }

  return null;
}

/** A non-negative integer, or `null` for anything else. */
function parseIndex(input: string): number | null {
  const value = input.trim();
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Split one CSV line, honouring double quotes.
 *
 * Deliberately not a CSV library. The accepted shape here is two or three
 * numeric columns; a dependency that also handles embedded newlines and
 * multi-character delimiters would be carrying weight for a file format that
 * cannot use any of it.
 */
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

/** Comma or semicolon — Excel in a European locale writes the latter. */
function detectDelimiter(line: string): string {
  return (line.match(/;/g)?.length ?? 0) > (line.match(/,/g)?.length ?? 0) ? ";" : ",";
}

export class CsvFormatError extends Error {}

/**
 * Parse the file. Never throws for a bad *row* — a bad row is a result, and the
 * organiser needs to see it next to the good ones. Throws only when the file as
 * a whole cannot be interpreted, which is a different conversation.
 */
export function parseResultsCsv(text: string): ParsedCsv {
  const lines = text.split(/\r?\n/);
  // A file that ends with a newline splits to one trailing empty element. It is
  // not a blank line anybody typed, and counting it would make `skipped`
  // disagree with what the organiser sees in their editor.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const firstContent = lines.findIndex((l) => l.trim() !== "" && !l.trimStart().startsWith("#"));
  if (firstContent === -1) throw new CsvFormatError("the file contains no rows");

  const delimiter = detectDelimiter(lines[firstContent] ?? "");
  const headerCells = splitLine(lines[firstContent] ?? "", delimiter).map(normaliseHeader);
  const mapped = headerCells.map((h) => HEADER_ALIASES[h]);

  if (!mapped.includes("bib_no") || !mapped.includes("finish_time_s")) {
    throw new CsvFormatError(
      `the header row must name a bib column and a finish time column; got ` +
        `[${headerCells.join(", ")}]. Recognised names: bib_no/bib/number, ` +
        `finish_time_s/finish_time/time/chip_time, and optionally category_id.`,
    );
  }

  const bibAt = mapped.indexOf("bib_no");
  const timeAt = mapped.indexOf("finish_time_s");
  const categoryAt = mapped.indexOf("category_id");

  const rows: ParsedRow[] = [];
  let skipped = 0;

  for (let i = firstContent + 1; i < lines.length; i += 1) {
    const raw = lines[i] ?? "";
    if (raw.trim() === "" || raw.trimStart().startsWith("#")) {
      skipped += 1;
      continue;
    }

    const cells = splitLine(raw, delimiter);
    const line = i + 1;
    const bibCell = cells[bibAt] ?? "";
    const timeCell = cells[timeAt] ?? "";
    const categoryCell = categoryAt === -1 ? "" : (cells[categoryAt] ?? "");

    const bibNo = parseIndex(bibCell);
    const finishTimeS = parseFinishTime(timeCell);
    const categoryId = categoryCell.trim() === "" ? null : parseIndex(categoryCell);

    let problem: string | null = null;
    if (bibNo === null) {
      problem = `bib number ${JSON.stringify(bibCell.trim())} is not a whole number`;
    } else if (finishTimeS === null) {
      problem =
        `finish time ${JSON.stringify(timeCell.trim())} is not a number of seconds ` +
        `or a mm:ss / hh:mm:ss duration`;
    } else if (categoryAt !== -1 && categoryCell.trim() !== "" && categoryId === null) {
      problem = `category ${JSON.stringify(categoryCell.trim())} is not a whole number`;
    }

    rows.push({
      line,
      raw,
      bibNo: problem === null ? bibNo : null,
      categoryId: problem === null ? categoryId : null,
      finishTimeS: problem === null ? finishTimeS : null,
      problem,
    });
  }

  return { rows, header: headerCells, skipped };
}
