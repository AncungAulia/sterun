/**
 * STE-68 — what gets cancelled, and what only gets reported.
 *
 * Run: pnpm --filter be exec tsx --test ../docs/rehearsal/test/cleanup.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { cancelRaces, isOurSanityRace, litter, pendingCleanupNote, stillOpen, visible, type RaceState } from "../src/cleanup";

const OURS = "GOURS";
const ANCUNG = "GANCUNG";
const NOW = 1_790_300_000n; // 2026-09-25
const FIXTURE_DATE = 1_800_000_000n; // 2027-01-15, the sc/ scripts' starts_at

const race = (eventId: number, name: string, organiser: string, status = "Open", startsAt = FIXTURE_DATE): RaceState => ({
  eventId,
  name,
  organiser,
  status,
  startsAt,
});

// The five rows at the top of the directory on 2026-09-25, and neighbours.
const DIRECTORY: RaceState[] = [
  race(19, "Sterun quota increase sanity 2026-09-15", OURS),
  race(18, "Sterun quota increase sanity 2026-09-15", OURS),
  race(17, "Sterun bib uniqueness sanity 2026-09-14", OURS),
  race(14, "Sterun untimed finish sanity 2026-09-11", OURS, "Closed"),
  race(7, "Sterun allowlist sanity 2026-09-09", OURS, "Draft"),
  race(12, "Sterun sanity already done", OURS, "Cancelled"),
  race(3, "Sterun Testnet Rehearsal", OURS, "Open", 1_789_000_000n),
  race(30, "Jakarta Kota Tua 10K 2026", OURS),
  race(21, "LARI TEKNIK (TESTING)", ANCUNG),
  race(22, "TechSprint UGM 2026 (TESTING 3)", ANCUNG),
  race(23, "TESTING LARI 4", ANCUNG),
  race(24, "Jogja Run 2026 (Testing)", ANCUNG),
  race(25, "Old TESTING race that ran", ANCUNG, "Open", NOW - 86_400n),
  race(26, "Semarang 10K", ANCUNG),
];

test("the five sanity rows, and deploy-testnet.sh's rehearsal race, are cancellable in any non-terminal status", () => {
  const { cancellable } = litter(DIRECTORY, new Set([OURS]), NOW);
  assert.deepEqual(cancellable.map((r) => r.eventId), [19, 18, 17, 14, 7, 3]);
});

test("a race of ours without 'sanity' in its name is never cancelled by the sweep", () => {
  assert.equal(isOurSanityRace(race(30, "Jakarta Kota Tua 10K 2026", OURS), new Set([OURS])), false);
  // "sanity" as a word, not a fragment of one
  assert.equal(isOurSanityRace(race(31, "Insanity Trail 50K", OURS), new Set([OURS])), false);
});

test("someone else's sanity race is not ours to cancel", () => {
  assert.equal(isOurSanityRace(race(40, "Sterun allowlist sanity", ANCUNG), new Set([OURS])), false);
});

test("test races we hold no key for are reported, and only the ones still on the default list", () => {
  const { theirs } = litter(DIRECTORY, new Set([OURS]), NOW);
  assert.deepEqual(theirs.map((r) => r.eventId), [21, 22, 23, 24]);
});

test("the default list hides cancelled races and races whose start has passed", () => {
  assert.equal(visible(race(1, "x", OURS, "Open", NOW + 1n), NOW), true);
  assert.equal(visible(race(1, "x", OURS, "Completed", NOW + 1n), NOW), true, "a Completed race still to start is shown");
  assert.equal(visible(race(1, "x", OURS, "Cancelled", NOW + 1n), NOW), false);
  assert.equal(visible(race(1, "x", OURS, "Open", NOW - 1n), NOW), false);
});

test("a run's own leftovers: everything not terminal", () => {
  const mine = [race(1, "STE-25 Rehearsal Run", OURS, "Closed"), race(2, "STE-25 Cancelled Race", OURS, "Cancelled"), race(3, "x", OURS, "Completed")];
  assert.deepEqual(stillOpen(mine).map((r) => r.eventId), [1]);
});

test("the pending note says the run died and names the races", () => {
  const note = pendingCleanupNote([41, 42]);
  assert.match(note, /died before its cleanup/);
  assert.match(note, /41, 42/);
});

test("cancelRaces re-reads, skips terminal races, and carries on past a failure", async () => {
  const status = new Map<number, string>([
    [1, "Open"],
    [2, "Completed"],
    [3, "Closed"],
    [4, "Open"],
  ]);
  const sent: number[] = [];
  const client = {
    async getEvent(eventId: number) {
      return { status: status.get(eventId)! };
    },
    async setEventStatus(eventId: number) {
      if (eventId === 3) throw new Error("Error(Contract, #1) NotOrganiser\nstack…");
      sent.push(eventId);
      return { txHash: `tx${eventId}` };
    },
  };
  const out = await cancelRaces(client, [1, 2, 3, 4], {});
  assert.deepEqual(sent, [1, 4]);
  assert.deepEqual(out, [
    { eventId: 1, before: "Open", txHash: "tx1" },
    { eventId: 2, before: "Completed" },
    { eventId: 3, before: "Closed", error: "Error(Contract, #1) NotOrganiser" },
    { eventId: 4, before: "Open", txHash: "tx4" },
  ]);
});
