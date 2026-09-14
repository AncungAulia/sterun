/**
 * The sums behind one race's console page, kept out of the components.
 *
 * Two sources meet here and are kept apart on purpose. Counts that decide
 * money and places come from the chain (`SterunCategory`, `SterunAddOn`); what
 * happened to each runner and when comes from the index (`IndexedRecord`),
 * because the chain keeps its events for days and the index keeps them.
 */
import type { IndexedRecord } from "@/lib/records";
import type { SterunAddOn, SterunCategory } from "@sterunxyz/sdk";

export interface RaceTotals {
  entered: number;
  quota: number;
  /** Entry fees plus add-on sales, in stroops. */
  received: bigint;
  /** What a sell-out of every distance and every add-on would pay. */
  potential: bigint;
}

export function raceTotals(
  categories: readonly SterunCategory[],
  addOns: readonly SterunAddOn[],
): RaceTotals {
  let entered = 0;
  let quota = 0;
  let received = 0n;
  let potential = 0n;
  for (const category of categories) {
    entered += category.enteredCount;
    quota += category.quota;
    received += BigInt(category.enteredCount) * category.priceStroops;
    potential += BigInt(category.quota) * category.priceStroops;
  }
  for (const addOn of addOns) {
    received += BigInt(addOn.reservedCount) * addOn.priceStroops;
    potential += BigInt(addOn.quota) * addOn.priceStroops;
  }
  return { entered, quota, received, potential };
}

/**
 * Race packs that left the desk. Read from `claimedAt`, not from the state:
 * a runner who collected and then finished still collected, and a no-show
 * marked DNF never did.
 */
export function packsCollected(records: readonly IndexedRecord[]): number {
  return records.filter((record) => record.claimedAt !== null).length;
}

export type EntryStatus = "not-collected" | "collected" | "finished" | "dnf";

export function entryStatus(record: IndexedRecord): EntryStatus {
  switch (record.state) {
    case "Entered":
      return "not-collected";
    case "RacepackClaimed":
      return "collected";
    case "Finished":
      return "finished";
    case "Dnf":
      return "dnf";
  }
}

export type StatusFilter = "all" | EntryStatus;

export interface EntryFilter {
  query: string;
  categoryId: number | null;
  status: StatusFilter;
}

/**
 * The entries table after search and the two filters, earliest entry first.
 *
 * A number is a bib, matched exactly and never by prefix: an organiser typing
 * 1 is not asking for bibs 10 to 19. It is not also tried against wallets,
 * because almost every address contains a digit and bib 7 would otherwise
 * list half the race. Anything with a letter in it matches a wallet on any
 * part, case-blind, because people search with the characters they can see on
 * a phone. Names are not searchable and never will be here: they are in the
 * vault.
 */
export function filterEntries(
  records: readonly IndexedRecord[],
  { query, categoryId, status }: EntryFilter,
): IndexedRecord[] {
  const needle = query.trim().toUpperCase();
  return records
    .filter((record) => {
      if (categoryId !== null && record.categoryId !== categoryId) return false;
      if (status !== "all" && entryStatus(record) !== status) return false;
      if (needle === "") return true;
      if (/^\d+$/.test(needle)) return String(record.bibNo) === needle;
      return record.runnerAddress.toUpperCase().includes(needle);
    })
    .sort((a, b) =>
      a.enteredAt === b.enteredAt ? a.tokenId - b.tokenId : a.enteredAt < b.enteredAt ? -1 : 1,
    );
}

/**
 * Add-ons still owed to runners who have not collected their pack.
 *
 * `null`, not 0, when any record arrives without its add-ons: the index does
 * not send them yet (STE-42), and a zero would tell an organiser there is
 * nothing left to hand out on the morning there is a box of shirts to hand out.
 */
export function addOnsToHandOut(records: readonly IndexedRecord[]): number | null {
  let owed = 0;
  for (const record of records) {
    if (record.addonIds === null) return null;
    if (record.claimedAt === null && record.state === "Entered") owed += record.addonIds.length;
  }
  return owed;
}

export type ActivityKind = "entered" | "collected" | "finished" | "dnf";

export interface ActivityItem {
  kind: ActivityKind;
  at: bigint;
  tokenId: number;
  bibNo: number;
  code: string;
  /** Only meaningful on `finished`. `null` there is "No official time". */
  finishTimeS: number | null;
}

/** Every dated thing the index knows about the race's records, newest first. */
export function recentActivity(
  records: readonly IndexedRecord[],
  categories: readonly { categoryId: number; code: string }[],
  limit: number,
): ActivityItem[] {
  const codes = new Map(categories.map((category) => [category.categoryId, category.code]));
  const items: ActivityItem[] = [];

  for (const record of records) {
    const base = {
      tokenId: record.tokenId,
      bibNo: record.bibNo,
      code: codes.get(record.categoryId) ?? `Distance ${record.categoryId}`,
      finishTimeS: null,
    };
    items.push({ ...base, kind: "entered", at: record.enteredAt });
    if (record.claimedAt !== null) items.push({ ...base, kind: "collected", at: record.claimedAt });
    if (record.resultAt !== null && record.state === "Finished") {
      items.push({ ...base, kind: "finished", at: record.resultAt, finishTimeS: record.finishTimeS });
    }
    if (record.resultAt !== null && record.state === "Dnf") {
      items.push({ ...base, kind: "dnf", at: record.resultAt });
    }
  }

  return items
    .sort((a, b) => (a.at === b.at ? b.tokenId - a.tokenId : a.at > b.at ? -1 : 1))
    .slice(0, limit);
}

/** A finish time the way a results board prints it. */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const ss = String(seconds % 60).padStart(2, "0");
  if (hours === 0) return `${minutes}:${ss}`;
  return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
}

const MINUTE = 60n;
const HOUR = 3_600n;
const DAY = 86_400n;

/** How long ago, in the words somebody would use. The future is "just now". */
export function timeAgo(at: bigint, nowS: bigint): string {
  const gone = nowS - at;
  if (gone < MINUTE) return "just now";
  if (gone < HOUR) return `${gone / MINUTE} min ago`;
  if (gone < DAY) return `${gone / HOUR} h ago`;
  if (gone < 2n * DAY) return "yesterday";
  return `${gone / DAY} days ago`;
}
