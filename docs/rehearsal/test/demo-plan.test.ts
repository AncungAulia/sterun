/**
 * STE-68 — the demo plan meets the SOW's numbers, and reads like races.
 *
 * Run: pnpm --filter be exec tsx --test ../docs/rehearsal/test/demo-plan.test.ts
 */
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  ENTRIES,
  RACES,
  RACE_DAY,
  RESULTS,
  RUNNERS,
  clock,
  entryPrice,
  lastSunday,
  localToUnix,
  raceDate,
  resultsCsv,
  runnersInPlay,
  spendByRunner,
  startsAt,
} from "../src/demo-plan";

const POSTERS = join(__dirname, "..", "demo", "posters");
/** The faucet's payout on the live box (`GET /config` faucet.amountStroops), in sUSD. */
const FAUCET_SUSD = 50;
const NOW = new Date("2026-09-25T06:00:00Z"); // a Friday, 13:00 WIB

test("SOW §3: at least 3 races and 20 records", () => {
  assert.ok(RACES.length >= 3, `${RACES.length} races`);
  assert.ok(ENTRIES.length >= 20, `${ENTRIES.length} records`);
});

test("at least one race has run, with finish times, and all its entrants have a result", () => {
  const ran = RACES.filter((r) => r.outcome === "run");
  assert.ok(ran.length >= 1);
  const entrants = ENTRIES.filter((e) => e.race === RACE_DAY.race).map((e) => e.runner).sort();
  assert.deepEqual(RESULTS.map((r) => r.runner).sort(), entrants, "one result per entrant, no more, no less");
  assert.ok(RESULTS.filter((r) => r.kind === "timed").length >= 5, "most of them with a time");
  assert.ok(RESULTS.some((r) => r.kind === "untimed"), "an untimed finish, which must never render as 0");
  assert.ok(RESULTS.some((r) => r.kind === "dnf"));
});

test("the two fraud attempts are two different runners of the race that ran, neither the no-show", () => {
  const entrants = new Set(ENTRIES.filter((e) => e.race === RACE_DAY.race).map((e) => e.runner));
  assert.ok(entrants.has(RACE_DAY.duplicate) && entrants.has(RACE_DAY.screenshot) && entrants.has(RACE_DAY.noShow));
  assert.equal(new Set([RACE_DAY.duplicate, RACE_DAY.screenshot, RACE_DAY.noShow]).size, 3);
  assert.equal(RESULTS.find((r) => r.runner === RACE_DAY.noShow)?.kind, "dns", "the no-show never collected, so can only be DNS");
  for (const label of [RACE_DAY.duplicate, RACE_DAY.screenshot]) {
    assert.notEqual(RESULTS.find((r) => r.runner === label)?.kind, "dns", `${label} collected a pack`);
  }
});

test("the directory, race pages and runner pages all have something on them", () => {
  for (const r of RACES) assert.ok(ENTRIES.filter((e) => e.race === r.key).length >= 3, `${r.key} has entrants`);
  const multi = runnersInPlay().filter((r) => ENTRIES.filter((e) => e.runner === r.label).length >= 2);
  assert.ok(multi.length >= 5, `${multi.length} runners hold records in two or more races`);
});

test("names read like races, not fixtures", () => {
  for (const r of RACES) {
    assert.doesNotMatch(r.name, /\b(test|testing|sanity|rehearsal|demo|fixture)\b/i, r.name);
    assert.ok(r.name.length <= 40, `${r.name} fits a card`);
  }
  assert.equal(new Set(RACES.map((r) => r.name)).size, RACES.length);
});

test("every race is honest that it is a testnet demo", () => {
  for (const r of RACES) assert.match(r.description, /Stellar testnet/);
});

test("dates are spread, on race days, and only the race that ran is in the past", () => {
  const starts = RACES.map((r) => startsAt(r, NOW));
  assert.equal(new Set(starts).size, RACES.length, "no two races share a timestamp");
  const nowS = NOW.getTime() / 1000;
  for (const r of RACES) {
    const s = startsAt(r, NOW);
    assert.equal(s < nowS, r.outcome === "run", `${r.key} is ${s < nowS ? "past" : "upcoming"}`);
    const dow = new Date(`${raceDate(r, NOW)}T12:00:00Z`).getUTCDay();
    assert.equal(dow, r.dayShift === -1 ? 6 : 0, `${r.key} is on a ${r.dayShift === -1 ? "Saturday" : "Sunday"}`);
  }
  assert.equal(raceDate(RACES[0]!, NOW), "2026-09-20");
});

test("the last Sunday is strictly before today, in Jakarta", () => {
  // Sunday 2026-09-27 at 06:00 WIB: the race that ran is the week before, not this morning's.
  assert.deepEqual(lastSunday(new Date("2026-09-26T23:00:00Z")), { y: 2026, m: 9, d: 20 });
  // Saturday 23:59 in Jakarta: still Saturday there.
  assert.deepEqual(lastSunday(new Date("2026-09-26T16:59:00Z")), { y: 2026, m: 9, d: 20 });
  assert.deepEqual(lastSunday(new Date("2026-09-28T00:00:00Z")), { y: 2026, m: 9, d: 27 });
});

test("local times convert with the race's own zone (WITA in Bali)", () => {
  assert.equal(new Date(localToUnix("2026-12-06", "05:00", "Asia/Makassar") * 1000).toISOString(), "2026-12-05T21:00:00.000Z");
  assert.equal(new Date(localToUnix("2026-09-20", "05:30", "Asia/Jakarta") * 1000).toISOString(), "2026-09-19T22:30:00.000Z");
});

test("one faucet payout covers every runner's entries", () => {
  for (const [label, spend] of spendByRunner()) assert.ok(spend <= FAUCET_SUSD, `${label} spends ${spend} sUSD`);
});

test("entries are consistent with their races, and nobody enters one race twice", () => {
  const seen = new Set<string>();
  for (const entry of ENTRIES) {
    assert.doesNotThrow(() => entryPrice(entry));
    const key = `${entry.race}/${entry.runner}`;
    assert.ok(!seen.has(key), `${key} twice`);
    seen.add(key);
  }
});

test("codes are Soroban Symbols the console would accept, and quotas hold the entries", () => {
  for (const r of RACES) {
    for (const c of r.categories) {
      assert.match(c.code, /^[A-Za-z0-9_]{1,32}$/);
      assert.ok(ENTRIES.filter((e) => e.race === r.key && e.category === c.code).length <= c.quota);
    }
    for (const a of r.addOns) {
      assert.match(a.code, /^[A-Za-z0-9_]{1,32}$/);
      for (const code of a.includedIn) assert.ok(r.categories.some((c) => c.code === code));
    }
  }
});

test("runners fit what POST /participants accepts", () => {
  assert.equal(new Set(RUNNERS.map((r) => r.label)).size, RUNNERS.length);
  for (const r of RUNNERS) {
    assert.ok(r.bibName.length >= 1 && r.bibName.length <= 16);
    assert.match(r.dateOfBirth, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("every race has its poster on disk, small enough for POST /events/files", () => {
  for (const r of RACES) {
    const path = join(POSTERS, r.poster);
    assert.ok(existsSync(path), `${r.poster} exists`);
    const size = statSync(path).size;
    assert.ok(size > 10_000 && size < 5 * 1024 * 1024, `${r.poster} is ${size} bytes`);
  }
});

test("the results file is the shape the preview parses", () => {
  const bibs = new Map(ENTRIES.filter((e) => e.race === "solo").map((e, i) => [e.runner, i + 1]));
  const csv = resultsCsv((label) => bibs.get(label)!);
  const lines = csv.split("\n");
  assert.equal(lines[0], "bib_no,finish_time,status");
  assert.equal(lines.length, RESULTS.length + 1);
  assert.equal(lines[1], "1,0:47:12,finished");
  assert.ok(lines.includes("12,,untimed"));
  assert.ok(lines.includes("10,,dns"));
  assert.equal(clock(3661), "1:01:01");
});
