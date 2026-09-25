/**
 * STE-68 — what one seed run leaves on testnet, as data.
 *
 * SOW §3: "a live demo seeded with at least 3 events and 20 issued records,
 * including two deliberate fraud attempts". The plan below is four races and
 * twenty-five records, one race already run with finish times on it, and the
 * two fraud attempts inside that race. `test/demo-plan.test.ts` holds it to
 * those numbers, so a later edit cannot quietly fall under them.
 *
 * Kept free of I/O and of the SDK so the numbers are checked without a
 * network. seed.ts turns it into transactions.
 *
 * ## Dates
 *
 * Computed from the moment of the run, never fixed: a fixed date is correct
 * for a week and then the "upcoming" races are in the past. Indonesian road
 * races go off on Sunday mornings, so every race is placed on a Sunday (the
 * night run on the Saturday before one), counted from the last Sunday before
 * the run. That is also why no two share a timestamp — the five fixture rows
 * this ticket is clearing all said 2027-01-15.
 *
 * The race that has already run is the last Sunday. Its records are created
 * on the day of the seed, after the race: a record cannot predate the call
 * that makes it, and the record pages show the real ledger times. The race's
 * description says it is a testnet demo.
 */

export type TimeZoneName = "Asia/Jakarta" | "Asia/Makassar";

/** Hours east of UTC, for the two zones used. WIB and WITA have no DST. */
export const UTC_OFFSET: Record<TimeZoneName, number> = { "Asia/Jakarta": 7, "Asia/Makassar": 8 };

export interface PlannedCategory {
  /** Soroban Symbol, and the join between the document and the chain. */
  code: string;
  distanceM: number;
  quota: number;
  priceSusd: number;
  /** Local `HH:mm` on race day. */
  startTime: string;
  cutOff: string;
}

export interface PlannedAddOn {
  code: string;
  name: string;
  priceSusd: number;
  quota: number;
  includedIn: string[];
}

export interface PlannedRace {
  key: "solo" | "kotatua" | "braga" | "sanur";
  name: string;
  /** Weeks after the last Sunday before the run; 0 is that Sunday. */
  weeks: number;
  /** Days added to that Sunday: -1 is the Saturday before it. */
  dayShift: number;
  timeZone: TimeZoneName;
  /** Local `HH:mm`: the first gun, which is `starts_at` on chain. */
  gunStart: string;
  /** `run` ends Completed with results; `open` is taking entries. */
  outcome: "run" | "open";
  categories: PlannedCategory[];
  addOns: PlannedAddOn[];
  /** Entries stop this many days before race day (`set_registration_closes`); open races only. */
  registrationClosesDaysBefore: number | null;
  venue: { name: string; city: string; province: string; lat: number; lng: number };
  racepack: { daysBefore: number; opens: string; closes: string; venue: string };
  /** File under docs/rehearsal/demo/posters/. */
  poster: string;
  description: string;
  terms: string;
}

export interface PlannedRunner {
  label: string;
  name: string;
  bibName: string;
  gender: "female" | "male";
  dateOfBirth: string;
}

export interface PlannedEntry {
  race: PlannedRace["key"];
  runner: string;
  category: string;
  addOns: string[];
}

/**
 * What happened to each entrant of the race that ran. `dns` is a runner who
 * never came for the race pack; the results file says so and it is recorded as
 * DNF, the contract's word for both.
 */
export type PlannedResult =
  | { runner: string; kind: "timed"; seconds: number }
  | { runner: string; kind: "untimed" }
  | { runner: string; kind: "dnf" }
  | { runner: string; kind: "dns" };

const TESTNET_LINE = "A demo race on Stellar testnet, seeded by Sterun: entries are paid in test sUSD.";

const TERMS = (race: string) =>
  [
    `By entering ${race} you confirm you are fit to run the distance you chose and have trained for it.`,
    "Your bib is personal. A bib worn by someone else is disqualified, and the race pack is collected once, with the pass in your own wallet.",
    "Follow the marshals, keep to the course, and stop when a medic asks you to.",
    "Results are published on chain after the race and cannot be changed afterwards.",
  ].join("\n\n");

export const RACES: PlannedRace[] = [
  {
    key: "solo",
    name: "Solo Heritage Run 2026",
    weeks: 0,
    dayShift: 0,
    timeZone: "Asia/Jakarta",
    gunStart: "05:30",
    outcome: "run",
    categories: [
      { code: "10K", distanceM: 10_000, quota: 150, priceSusd: 12, startTime: "05:30", cutOff: "07:30" },
      { code: "5K", distanceM: 5_000, quota: 250, priceSusd: 8, startTime: "05:45", cutOff: "07:00" },
    ],
    addOns: [],
    registrationClosesDaysBefore: null,
    venue: { name: "Stadion Manahan", city: "Surakarta", province: "Jawa Tengah", lat: -7.5556, lng: 110.8061 },
    racepack: { daysBefore: 1, opens: "10:00", closes: "20:00", venue: "Stadion Manahan, Gate 3" },
    poster: "solo-heritage-run.jpg",
    description:
      "A morning loop out of Stadion Manahan, past Pura Mangkunegaran and along Jalan Slamet Riyadi while the city is still closed to traffic. " +
      `Flat, fast, and finished before the heat. ${TESTNET_LINE}`,
    terms: TERMS("Solo Heritage Run 2026"),
  },
  {
    key: "kotatua",
    name: "Kota Tua 10K 2026",
    weeks: 3,
    dayShift: 0,
    timeZone: "Asia/Jakarta",
    gunStart: "05:00",
    outcome: "open",
    categories: [
      { code: "10K", distanceM: 10_000, quota: 400, priceSusd: 15, startTime: "05:00", cutOff: "06:45" },
      { code: "5K", distanceM: 5_000, quota: 600, priceSusd: 10, startTime: "05:20", cutOff: "06:30" },
    ],
    addOns: [{ code: "TUMBLER", name: "Kota Tua finisher tumbler", priceSusd: 4, quota: 300, includedIn: ["10K", "5K"] }],
    registrationClosesDaysBefore: 7,
    venue: { name: "Taman Fatahillah", city: "Jakarta Barat", province: "DKI Jakarta", lat: -6.1352, lng: 106.8133 },
    racepack: { daysBefore: 2, opens: "10:00", closes: "21:00", venue: "Museum Fatahillah courtyard" },
    poster: "kota-tua-10k.jpg",
    description:
      "Start and finish on Taman Fatahillah, out along the Kali Besar canal to Sunda Kelapa harbour and back through the old town. " +
      `Two distances, one early start. ${TESTNET_LINE}`,
    terms: TERMS("Kota Tua 10K 2026"),
  },
  {
    key: "braga",
    name: "Braga Night Run 2026",
    weeks: 7,
    dayShift: -1,
    timeZone: "Asia/Jakarta",
    gunStart: "19:00",
    outcome: "open",
    categories: [
      { code: "7K", distanceM: 7_000, quota: 300, priceSusd: 11, startTime: "19:00", cutOff: "20:30" },
      { code: "3K", distanceM: 3_000, quota: 200, priceSusd: 0, startTime: "19:15", cutOff: "20:15" },
    ],
    addOns: [],
    registrationClosesDaysBefore: 5,
    venue: { name: "Jalan Braga", city: "Bandung", province: "Jawa Barat", lat: -6.9175, lng: 107.6093 },
    racepack: { daysBefore: 1, opens: "12:00", closes: "20:00", venue: "Gedung Merdeka forecourt" },
    poster: "braga-night-run.jpg",
    description:
      "A Saturday-night run under the lamps of Jalan Braga and around Alun-Alun Bandung. The 3K is free and made for families. " +
      TESTNET_LINE,
    terms: TERMS("Braga Night Run 2026"),
  },
  {
    key: "sanur",
    name: "Sanur Sunrise Half Marathon 2026",
    weeks: 11,
    dayShift: 0,
    timeZone: "Asia/Makassar",
    gunStart: "05:00",
    outcome: "open",
    categories: [
      { code: "HM", distanceM: 21_097, quota: 200, priceSusd: 20, startTime: "05:00", cutOff: "08:00" },
      { code: "10K", distanceM: 10_000, quota: 300, priceSusd: 15, startTime: "05:30", cutOff: "07:15" },
    ],
    addOns: [],
    registrationClosesDaysBefore: 10,
    venue: { name: "Pantai Sanur", city: "Denpasar", province: "Bali", lat: -8.6783, lng: 115.2631 },
    racepack: { daysBefore: 2, opens: "10:00", closes: "19:00", venue: "Sanur beachfront, Jalan Danau Tamblingan" },
    poster: "sanur-sunrise-half.jpg",
    description:
      "Out along the Sanur beach path before sunrise and back as the sun comes up over the water. Times are WITA. " +
      TESTNET_LINE,
    terms: TERMS("Sanur Sunrise Half Marathon 2026"),
  },
];

export const RUNNERS: PlannedRunner[] = [
  { label: "R01", name: "Budi Santoso", bibName: "BUDI", gender: "male", dateOfBirth: "1988-03-14" },
  { label: "R02", name: "Siti Rahayu", bibName: "SITI", gender: "female", dateOfBirth: "1992-07-02" },
  { label: "R03", name: "Andi Wijaya", bibName: "ANDI", gender: "male", dateOfBirth: "1985-11-23" },
  { label: "R04", name: "Dewi Lestari", bibName: "DEWI", gender: "female", dateOfBirth: "1995-01-30" },
  { label: "R05", name: "Rizky Pratama", bibName: "RIZKY", gender: "male", dateOfBirth: "1998-06-11" },
  { label: "R06", name: "Putri Ayu Maharani", bibName: "PUTRI", gender: "female", dateOfBirth: "1996-09-05" },
  { label: "R07", name: "Agus Setiawan", bibName: "AGUS", gender: "male", dateOfBirth: "1979-12-19" },
  { label: "R08", name: "Nur Aini", bibName: "NUR", gender: "female", dateOfBirth: "1990-04-27" },
  { label: "R09", name: "Fajar Nugroho", bibName: "FAJAR", gender: "male", dateOfBirth: "1993-08-08" },
  { label: "R10", name: "Maya Anggraini", bibName: "MAYA", gender: "female", dateOfBirth: "1987-02-16" },
  { label: "R11", name: "Yoga Prasetyo", bibName: "YOGA", gender: "male", dateOfBirth: "2000-10-21" },
  { label: "R12", name: "Intan Permatasari", bibName: "INTAN", gender: "female", dateOfBirth: "1994-05-09" },
  { label: "R13", name: "Dimas Ardiansyah", bibName: "DIMAS", gender: "male", dateOfBirth: "1991-01-12" },
  { label: "R14", name: "Ratna Sari", bibName: "RATNA", gender: "female", dateOfBirth: "1983-07-25" },
  { label: "R15", name: "Hendra Gunawan", bibName: "HENDRA", gender: "male", dateOfBirth: "1976-03-03" },
  { label: "R16", name: "Larasati Wibowo", bibName: "LARAS", gender: "female", dateOfBirth: "1999-11-30" },
];

const e = (race: PlannedRace["key"], runner: string, category: string, addOns: string[] = []): PlannedEntry => ({ race, runner, category, addOns });

/** In entry order, which is bib order within each race. */
export const ENTRIES: PlannedEntry[] = [
  // Solo Heritage Run — the race that has run.
  e("solo", "R01", "10K"),
  e("solo", "R02", "10K"),
  e("solo", "R03", "10K"),
  e("solo", "R04", "5K"),
  e("solo", "R05", "10K"),
  e("solo", "R06", "5K"),
  e("solo", "R07", "10K"),
  e("solo", "R08", "5K"),
  e("solo", "R09", "10K"),
  e("solo", "R10", "5K"),
  e("solo", "R11", "10K"),
  e("solo", "R12", "5K"),
  // Kota Tua 10K — open, three weeks out.
  e("kotatua", "R01", "10K"),
  e("kotatua", "R02", "10K", ["TUMBLER"]),
  e("kotatua", "R05", "5K", ["TUMBLER"]),
  e("kotatua", "R13", "10K"),
  e("kotatua", "R14", "5K"),
  e("kotatua", "R08", "5K"),
  // Braga Night Run — open, seven weeks out.
  e("braga", "R03", "7K"),
  e("braga", "R04", "3K"),
  e("braga", "R15", "7K"),
  e("braga", "R14", "3K"),
  // Sanur Sunrise Half — open, eleven weeks out.
  e("sanur", "R01", "HM"),
  e("sanur", "R09", "10K"),
  e("sanur", "R16", "HM"),
];

/**
 * Race day at the pack desks of the race that has run. Everyone who came
 * collects at the main desk in one hand-over, except the two fraud attempts,
 * which go through the offline desks:
 *
 *   duplicate   shows the pass at BOTH offline desks; both hand a pack over;
 *               the chain keeps one claim and the losing desk flags it.
 *   screenshot  a friend presents a screenshot of this runner's pass at one
 *               desk after it went stale (refused); the runner's live pass is
 *               then accepted at the other.
 */
export const RACE_DAY = {
  race: "solo" as const,
  duplicate: "R05",
  screenshot: "R11",
  noShow: "R10",
};

export const RESULTS: PlannedResult[] = [
  { runner: "R01", kind: "timed", seconds: 47 * 60 + 12 },
  { runner: "R02", kind: "timed", seconds: 58 * 60 + 40 },
  { runner: "R03", kind: "timed", seconds: 52 * 60 + 5 },
  { runner: "R04", kind: "timed", seconds: 31 * 60 + 18 },
  { runner: "R05", kind: "timed", seconds: 49 * 60 + 57 },
  { runner: "R06", kind: "timed", seconds: 27 * 60 + 44 },
  { runner: "R07", kind: "dnf" },
  { runner: "R08", kind: "timed", seconds: 36 * 60 + 2 },
  { runner: "R09", kind: "timed", seconds: 61 * 60 + 29 },
  { runner: "R10", kind: "dns" },
  { runner: "R11", kind: "timed", seconds: 44 * 60 + 51 },
  // The timing mat missed her; the organiser declares a finish with no official time.
  { runner: "R12", kind: "untimed" },
];

// ---------------------------------------------------------------------------
// Derived
// ---------------------------------------------------------------------------

export const race = (key: PlannedRace["key"]): PlannedRace => {
  const found = RACES.find((r) => r.key === key);
  if (!found) throw new Error(`no race ${key}`);
  return found;
};

export const runner = (label: string): PlannedRunner => {
  const found = RUNNERS.find((r) => r.label === label);
  if (!found) throw new Error(`no runner ${label}`);
  return found;
};

/** What one entry costs, in whole sUSD: the distance plus every add-on, one transfer on chain. */
export function entryPrice(entry: PlannedEntry): number {
  const r = race(entry.race);
  const category = r.categories.find((c) => c.code === entry.category);
  if (!category) throw new Error(`${entry.race} has no ${entry.category}`);
  const addOns = entry.addOns.map((code) => {
    const addOn = r.addOns.find((a) => a.code === code);
    if (!addOn) throw new Error(`${entry.race} has no add-on ${code}`);
    return addOn.priceSusd;
  });
  return category.priceSusd + addOns.reduce((sum, p) => sum + p, 0);
}

/** Each runner's total spend, which one faucet payout must cover. */
export function spendByRunner(): Map<string, number> {
  const out = new Map<string, number>();
  for (const entry of ENTRIES) out.set(entry.runner, (out.get(entry.runner) ?? 0) + entryPrice(entry));
  return out;
}

/** The runners who take part at all: each is one fresh wallet and one faucet payout. */
export function runnersInPlay(): PlannedRunner[] {
  const labels = new Set(ENTRIES.map((entry) => entry.runner));
  return RUNNERS.filter((r) => labels.has(r.label));
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The last Sunday strictly before the run's local date, at 00:00 local, as a
 * UTC calendar date (y, m, d) — the anchor every race is counted from.
 */
export function lastSunday(now: Date, zone: TimeZoneName = "Asia/Jakarta"): { y: number; m: number; d: number } {
  const local = new Date(now.getTime() + UTC_OFFSET[zone] * 3_600_000);
  const dow = local.getUTCDay(); // 0 = Sunday
  const back = dow === 0 ? 7 : dow;
  const sunday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - back));
  return { y: sunday.getUTCFullYear(), m: sunday.getUTCMonth() + 1, d: sunday.getUTCDate() };
}

/** Race day as `YYYY-MM-DD`, local to the race. */
export function raceDate(r: PlannedRace, now: Date): string {
  const anchor = lastSunday(now);
  const day = new Date(Date.UTC(anchor.y, anchor.m - 1, anchor.d + r.weeks * 7 + r.dayShift));
  return `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`;
}

/** A local date and `HH:mm` in the race's zone, as unix seconds. */
export function localToUnix(date: string, time: string, zone: TimeZoneName): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  return Date.UTC(y, m - 1, d, hh - UTC_OFFSET[zone], mm) / 1000;
}

/** `starts_at` on chain: the first gun, local to the race. */
export function startsAt(r: PlannedRace, now: Date): number {
  return localToUnix(raceDate(r, now), r.gunStart, r.timeZone);
}

/** A local date shifted by whole days. */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d + days));
  return `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`;
}

/** `H:MM:SS`, the way the results CSV and a runner write a finish time. */
export function clock(seconds: number): string {
  return `${Math.floor(seconds / 3600)}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
}

/** The results file the organiser uploads for preview, in bib order. */
export function resultsCsv(bibOf: (runnerLabel: string) => number): string {
  const rows = RESULTS.map((r) => {
    const bib = bibOf(r.runner);
    switch (r.kind) {
      case "timed":
        return `${bib},${clock(r.seconds)},finished`;
      case "untimed":
        return `${bib},,untimed`;
      case "dnf":
        return `${bib},,dnf`;
      case "dns":
        return `${bib},,dns`;
    }
  });
  return ["bib_no,finish_time,status", ...rows].join("\n");
}
