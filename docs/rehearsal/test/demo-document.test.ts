/**
 * STE-68 — the document the seed publishes is read by the race page with its
 * poster, venue and city, and agrees with the chain about when the race starts.
 *
 * Both ends are the web app's own code: `buildEventDocument` (the console's
 * writer) and `readEventDocument` / `gunStartConflict` (the page's reader).
 * They import `@/` paths, so this runs with the stage tsconfig:
 *
 *   pnpm --filter be exec tsx --tsconfig ../docs/rehearsal/tsconfig.stage.json --test ../docs/rehearsal/test/demo-document.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { gunStartConflict, readEventDocument } from "../../../fe/src/lib/event/metadata";
import { eventDocument, registrationClosesAt } from "../src/demo-document";
import { RACES, race, startsAt } from "../src/demo-plan";

const NOW = new Date("2026-09-25T06:00:00Z");
const POSTER = "https://api.sterun.xyz/files/" + "a".repeat(64);

for (const r of RACES) {
  test(`${r.name}: the page reads a poster, a venue and a city, and no gun-start conflict`, () => {
    const { text } = eventDocument(r, NOW, POSTER);
    const read = readEventDocument(text);
    assert.ok(typeof read === "object", "the page parses it");
    assert.equal(read.posterUrl, POSTER);
    assert.equal(read.location?.name, r.venue.name);
    assert.equal(read.location?.city, r.venue.city);
    assert.equal(read.location?.countryCode, "ID");
    assert.equal(read.location?.lat, r.venue.lat);
    assert.equal(gunStartConflict(read, BigInt(startsAt(r, NOW))), false, "document and chain agree on the start");
    assert.deepEqual(read.categories?.map((c) => c.code), r.categories.map((c) => c.code));
    assert.ok(read.terms && read.description);
  });
}

test("category start times are written in the race's own zone, not this machine's", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/Los_Angeles"; // a laptop somewhere else
  try {
    const read = readEventDocument(eventDocument(race("sanur"), NOW, POSTER).text);
    assert.ok(typeof read === "object");
    const hm = read.categories?.find((c) => c.code === "HM");
    // 05:00 WITA is 21:00 UTC the day before.
    assert.match(hm?.startTime ?? "", /T21:00:00\.000Z$/);
    assert.equal(process.env.TZ, "America/Los_Angeles", "the zone is restored");
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("the same inputs give the same bytes, which is what makes the hash stable", () => {
  const a = eventDocument(race("kotatua"), NOW, POSTER).text;
  const b = eventDocument(race("kotatua"), NOW, POSTER).text;
  assert.equal(a, b);
});

test("open races state a registration window that closes before race day; the race that ran states none", () => {
  const ran = readEventDocument(eventDocument(race("solo"), NOW, POSTER).text);
  assert.ok(typeof ran === "object");
  assert.ok(!ran.schedule?.some((p) => p.phase === "registration"));
  assert.equal(registrationClosesAt(race("solo"), NOW), null);
  for (const key of ["kotatua", "braga", "sanur"] as const) {
    const closes = registrationClosesAt(race(key), NOW)!;
    assert.ok(closes > NOW.getTime() / 1000 && closes < startsAt(race(key), NOW), `${key} closes between now and the race`);
  }
});
