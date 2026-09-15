# Organiser console — one race: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every race its own console page at `/org/events/[id]` with three tabs, Overview,
Entries and Scanners, plus the one status action in its header, built to the mockup rather than to
what the backend sends today.

**Architecture:** A server route reads `eventId` and `?tab=` and hands them to one client module,
`RaceConsole`, which reads the race from the chain (`useEvent`, `useEventAddOns`) and its entries and
scanners from the index (`useRaceRecords`, `useRaceScanners`). Tabs are links, not local state, so
the bell's `?tab=scanners` lands on the right tab and the rail keeps its state. Every number is
derived by pure functions in `modules/organiser/race.ts` and `chart.ts`; components stay thin.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query, Tailwind v4 + shadcn/ui,
`lucide-react`, `@sterunxyz/sdk`, `@stellar/stellar-sdk` (`StrKey`), Vitest + Testing Library.

**Spec:** [`../specs/2026-09-13-org-console-design.md`](../specs/2026-09-13-org-console-design.md),
"One race: four tabs". Mockup blocks 1, 3, 4 and 6 in
[`../specs/2026-09-13-org-console-mockup.html`](../specs/2026-09-13-org-console-mockup.html).
Follows [`2026-09-13-org-console-shell-and-dashboard.md`](2026-09-13-org-console-shell-and-dashboard.md),
whose `ConsoleHeader`, `StatCard`, `NeedsContext`, `UrgentBanner` and table style this reuses.

## Decisions taken with Ancung on 2026-09-14

- **Results is deferred.** The preview endpoint only accepts rows with a time (no untimed finish, no
  DNF), and recording results is one wallet signature per runner. The tab comes back after backend
  ticket C. Until then `?tab=results` falls back to Overview.
- **Nothing in the design is cut because the backend does not send it yet.** Per-entry add-ons, when
  a scanner was added, and how many runners a scanner checked in are all drawn to the mockup. The
  frontend reads each field as **optional**, and the column or card that depends on it appears on
  its own once the backend sends it. No placeholder values, no guessed dates. Tickets A and B below
  are what makes them appear.
- **Download roster is not in this plan.** The roster carries every runner's check-in secret; an
  organiser export of it needs its own decision.

## Backend and contract tickets this plan depends on (to be filed)

| # | Owner | What | Unlocks |
| --- | --- | --- | --- |
| A | be | `/events/:id/records` rows gain `addon_ids: number[]`, read from `RecordData.addon_ids` on chain (the indexer already reads the record back; `SterunRecord` in `sdk/` needs the field too) | Entries: **Add-ons** column, **Add-ons to hand out** card |
| B | be | `/events/:id/scanners` rows gain `added_at: string` (unix seconds, decimal string, the close time of `added_ledger`) and `scans: number` (count of `RacepackClaimed` events whose `operator` is this address, from `chain_events`) | Scanners: **Added at** and **Scanned** columns |
| C | be (+ sc if batching needs it) | results preview accepts untimed finishes and DNF rows; a way to record many results without one signature per runner | the Results tab |

Field names above are the contract between this plan and those tickets. If a ticket lands with a
different name, change the parser in Task 1, not the components.

## Global Constraints

Every task's requirements implicitly include all of this.

- **All UI text is English.** Labels, headings, empty states, placeholders, errors.
- **UI text names the consequence, not the mechanism.** *chain*, *contract*, *transaction*, *hash*,
  *ledger*, *revert*, *indexer* never reach the screen (`fe/CLAUDE.md` → Conventions).
- **A warning that has a cost is visible, never in a tooltip.**
- **Never an em dash or en dash in UI text**, in any spelling. `test/ui-rules.test.ts` enforces it.
- **"Draft" never appears.** Status words come only from `EventStatusBadge` / `statusLabel`.
- **A signing button says it signs:** "Sign and add", "Sign and remove", "Sign and open".
- **`finish_time_s == null` on a Finished record reads "No official time"**, never `0` (STE-41).
- **Search never claims to search runner names.** Placeholder: "Search a bib number or a wallet".
- **Filters are neutral**: no highlighted active-filter state.
- **Toolbars sit outside the card; a table card holds only its table.** Table headers sentence case
  on `bg-n-100`.
- **Icons from `lucide-react`.** No emoji, no hand-written icon SVG.
- **No raw hex, font name or px in a component.** Tokens from `fe/app/tokens.css` via Tailwind
  classes, or `var(--color-…)` inside SVG attributes, as `EntriesComparison.tsx` does.
- **No error reaches the screen as thrown.** `friendlyError` from `src/lib/errors.ts`.
- **Tests never touch the network.** Mock `@/lib/sterun`, `@/lib/api` and `@/lib/wallet`.
- **`vitest run` does not typecheck.** Every task ends with `pnpm --filter fe typecheck` too.
- **Do not run `pnpm --filter fe build`.** Ancung's dev server uses `.next`.
- Path alias `@/` is `fe/src/`. Run tests from the repository root:
  `pnpm --filter fe test <path>`.
- One commit per task, subject referencing **STE-17**, body explaining why. Do not push.

---

## File structure

**Created**

| File | Responsibility |
| --- | --- |
| `fe/src/lib/scanners.ts` | read a race's scanner list from the index, optional fields included |
| `fe/src/modules/organiser/race.ts` | pure: totals, entry status, filtering, activity, durations |
| `fe/src/modules/organiser/race-tab.ts` | the tab ids, parsing `?tab=`, building tab hrefs (no React) |
| `fe/src/modules/organiser/status-action.ts` | pure: which lifecycle move a race offers now |
| `fe/src/hooks/useRaceScanners.ts` | one race's scanner list as a query |
| `fe/app/(organiser)/org/(console)/events/[eventId]/page.tsx` | the route |
| `fe/app/(organiser)/org/(console)/not-found.tsx` | a 404 inside the console, without `SiteFrame` |
| `fe/src/modules/organiser/RaceConsole.tsx` | the page: header, tabs, the chosen tab |
| `fe/src/modules/organiser/component/RaceTabs.tsx` | the tab strip, as links |
| `fe/src/modules/organiser/component/StatusAction.tsx` | the header button and its confirm dialog |
| `fe/src/modules/organiser/component/OverviewTab.tsx` | stat cards and the four panels |
| `fe/src/modules/organiser/component/EntriesPerDay.tsx` | area chart with hover marker |
| `fe/src/modules/organiser/component/DistanceRings.tsx` | concentric half rings and their key |
| `fe/src/modules/organiser/component/ActivityFeed.tsx` | the last things that happened |
| `fe/src/modules/organiser/component/AddOnsPanel.tsx` | one bar per add-on |
| `fe/src/modules/organiser/component/EntriesTab.tsx` | cards, toolbar, entries table |
| `fe/src/modules/organiser/component/ScannersTab.tsx` | toolbar, scanners table, add/remove dialogs |

**Modified**

| File | Change |
| --- | --- |
| `fe/src/lib/records.ts` | carry `resultAt` and optional `addonIds` |
| `fe/src/hooks/useScannerCounts.ts` | use `lib/scanners.ts` |
| `fe/src/modules/organiser/chart.ts` | `areaPath`, `halfRingPath` |
| `fe/test/console-chrome.test.tsx` | the console 404 draws no second header |
| `fe/CLAUDE.md` | the race page's rules |

---

## Task 1: The race's data, and the sums drawn from it

**Files:**
- Modify: `fe/src/lib/records.ts`
- Create: `fe/src/lib/scanners.ts`
- Modify: `fe/src/hooks/useScannerCounts.ts`
- Create: `fe/src/hooks/useRaceScanners.ts`
- Create: `fe/src/modules/organiser/race.ts`
- Test: `fe/test/race.test.ts`, `fe/test/scanners.test.ts`

**Interfaces:**
- Produces, `lib/records.ts`: `IndexedRecord` gains `resultAt: bigint | null` and
  `addonIds: number[] | null` (`null` = the index does not send it yet, ticket A).
- Produces, `lib/scanners.ts`:
  `interface IndexedScanner { address: string; addedLedger: number; addedAt: bigint | null; scans: number | null }`,
  `fetchScanners(eventId: number): Promise<IndexedScanner[]>`.
- Produces, `hooks/useRaceScanners.ts`: `useRaceScanners(eventId: number)` → the React Query result
  of `fetchScanners`, key `["scanners", eventId]` (the same key `useScannerCounts` uses, so adding a
  scanner refreshes the bell too).
- Produces, `modules/organiser/race.ts`:
  - `raceTotals(categories: readonly SterunCategory[], addOns: readonly SterunAddOn[]): { entered: number; quota: number; received: bigint; potential: bigint }`
  - `packsCollected(records: readonly IndexedRecord[]): number`
  - `type EntryStatus = "not-collected" | "collected" | "finished" | "dnf"`
  - `entryStatus(record: IndexedRecord): EntryStatus`
  - `type StatusFilter = "all" | EntryStatus`
  - `filterEntries(records: readonly IndexedRecord[], filter: { query: string; categoryId: number | null; status: StatusFilter }): IndexedRecord[]`
  - `addOnsToHandOut(records: readonly IndexedRecord[]): number | null`
  - `type ActivityKind = "entered" | "collected" | "finished" | "dnf"`
  - `interface ActivityItem { kind: ActivityKind; at: bigint; tokenId: number; bibNo: number; code: string; finishTimeS: number | null }`
  - `recentActivity(records: readonly IndexedRecord[], categories: readonly { categoryId: number; code: string }[], limit: number): ActivityItem[]`
  - `formatDuration(seconds: number): string`
  - `timeAgo(at: bigint, nowS: bigint): string`

- [ ] **Step 1: Write the failing tests**

Create `fe/test/race.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { IndexedRecord } from "@/lib/records";
import {
  addOnsToHandOut,
  entryStatus,
  filterEntries,
  formatDuration,
  packsCollected,
  raceTotals,
  recentActivity,
  timeAgo,
} from "@/modules/organiser/race";
import type { SterunAddOn, SterunCategory } from "@sterunxyz/sdk";

const WALLET_A = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";
const WALLET_B = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";

function record(overrides: Partial<IndexedRecord> = {}): IndexedRecord {
  return {
    tokenId: 0,
    eventId: 0,
    categoryId: 0,
    bibNo: 1,
    runnerAddress: WALLET_A,
    state: "Entered",
    enteredAt: 1_000n,
    claimedAt: null,
    finishTimeS: null,
    resultAt: null,
    addonIds: null,
    ...overrides,
  };
}

function category(overrides: Partial<SterunCategory> = {}): SterunCategory {
  const quota = overrides.quota ?? 200;
  const enteredCount = overrides.enteredCount ?? 50;
  return {
    eventId: 0,
    categoryId: 0,
    code: "10K",
    distanceM: 10_000,
    quota,
    enteredCount,
    priceStroops: 100_000_000n,
    slotsLeft: quota - enteredCount,
    ...overrides,
  };
}

function addOn(overrides: Partial<SterunAddOn> = {}): SterunAddOn {
  const quota = overrides.quota ?? 100;
  const reservedCount = overrides.reservedCount ?? 10;
  return {
    eventId: 0,
    addonId: 0,
    code: "JERSEY_M",
    priceStroops: 50_000_000n,
    quota,
    reservedCount,
    unitsLeft: quota - reservedCount,
    ...overrides,
  };
}

describe("raceTotals", () => {
  describe("positive", () => {
    it("adds entry fees and add-on sales into what has been received", () => {
      const totals = raceTotals([category()], [addOn()]);
      expect(totals.entered).toBe(50);
      expect(totals.quota).toBe(200);
      // 50 x 10 sUSD + 10 x 5 sUSD
      expect(totals.received).toBe(5_500_000_000n);
      // 200 x 10 sUSD + 100 x 5 sUSD: a sell-out of both
      expect(totals.potential).toBe(25_000_000_000n);
    });
  });

  describe("edge", () => {
    it("is all zeros for a race with nothing on sale", () => {
      expect(raceTotals([], [])).toEqual({ entered: 0, quota: 0, received: 0n, potential: 0n });
    });
  });
});

describe("entryStatus and packsCollected", () => {
  describe("positive", () => {
    it("names each state the way the table reads it", () => {
      expect(entryStatus(record({ state: "Entered" }))).toBe("not-collected");
      expect(entryStatus(record({ state: "RacepackClaimed", claimedAt: 2n }))).toBe("collected");
      expect(entryStatus(record({ state: "Finished", claimedAt: 2n }))).toBe("finished");
      expect(entryStatus(record({ state: "Dnf" }))).toBe("dnf");
    });
  });

  describe("edge", () => {
    it("counts a pack as collected by its time, not by the state that followed it", () => {
      // A runner who collected and then finished still took a race pack home.
      // A no-show marked DNF never did.
      const records = [
        record({ state: "RacepackClaimed", claimedAt: 5n }),
        record({ state: "Finished", claimedAt: 5n }),
        record({ state: "Dnf", claimedAt: null }),
        record({ state: "Entered" }),
      ];
      expect(packsCollected(records)).toBe(2);
    });
  });
});

describe("filterEntries", () => {
  const records = [
    record({ tokenId: 1, bibNo: 12, categoryId: 0, runnerAddress: WALLET_A, enteredAt: 30n }),
    record({ tokenId: 2, bibNo: 7, categoryId: 1, runnerAddress: WALLET_B, enteredAt: 10n, state: "RacepackClaimed", claimedAt: 40n }),
  ];
  const all = { query: "", categoryId: null, status: "all" as const };

  describe("positive", () => {
    it("lists every entry, earliest first, when nothing narrows it", () => {
      expect(filterEntries(records, all).map((r) => r.tokenId)).toEqual([2, 1]);
    });

    it("finds a bib by its exact number", () => {
      expect(filterEntries(records, { ...all, query: "12" }).map((r) => r.tokenId)).toEqual([1]);
    });

    it("finds a wallet by any part of it, in any case", () => {
      expect(filterEntries(records, { ...all, query: "gaazi4" }).map((r) => r.tokenId)).toEqual([2]);
    });

    it("narrows by distance and by status together", () => {
      expect(filterEntries(records, { ...all, categoryId: 1, status: "collected" })).toHaveLength(1);
      expect(filterEntries(records, { ...all, categoryId: 0, status: "collected" })).toHaveLength(0);
    });
  });

  describe("negative", () => {
    it("does not match a bib by a prefix of it", () => {
      // "1" is not bib 12. An organiser typing a bib wants that runner.
      expect(filterEntries(records, { ...all, query: "1" })).toHaveLength(0);
    });
  });

  describe("edge", () => {
    it("ignores spaces around what was typed", () => {
      expect(filterEntries(records, { ...all, query: "  7 " })).toHaveLength(1);
    });
  });
});

describe("addOnsToHandOut", () => {
  describe("positive", () => {
    it("counts the add-ons of runners who have not collected yet", () => {
      const records = [
        record({ addonIds: [0, 1] }),
        record({ addonIds: [2], state: "RacepackClaimed", claimedAt: 3n }),
        record({ addonIds: [] }),
      ];
      expect(addOnsToHandOut(records)).toBe(2);
    });
  });

  describe("negative", () => {
    it("says nothing rather than zero when the index does not send add-ons yet", () => {
      expect(addOnsToHandOut([record({ addonIds: null })])).toBeNull();
    });
  });

  describe("edge", () => {
    it("is zero for a race nobody has entered", () => {
      expect(addOnsToHandOut([])).toBe(0);
    });
  });
});

describe("recentActivity", () => {
  const categories = [{ categoryId: 0, code: "10K" }];

  describe("positive", () => {
    it("turns each record into the things that happened to it, newest first", () => {
      const items = recentActivity(
        [
          record({ tokenId: 1, bibNo: 4, enteredAt: 10n, claimedAt: 20n, state: "Finished", finishTimeS: 3134, resultAt: 30n }),
          record({ tokenId: 2, bibNo: 5, enteredAt: 25n }),
        ],
        categories,
        10,
      );
      expect(items.map((item) => [item.kind, item.at])).toEqual([
        ["finished", 30n],
        ["entered", 25n],
        ["collected", 20n],
        ["entered", 10n],
      ]);
      expect(items[0]).toMatchObject({ bibNo: 4, code: "10K", finishTimeS: 3134 });
    });

    it("keeps only as many as asked for", () => {
      const many = Array.from({ length: 8 }, (_, i) => record({ tokenId: i, enteredAt: BigInt(i) }));
      expect(recentActivity(many, categories, 4)).toHaveLength(4);
    });
  });

  describe("edge", () => {
    it("reports a DNF as its own kind and an untimed finish with no time", () => {
      const items = recentActivity(
        [
          record({ tokenId: 1, state: "Dnf", resultAt: 50n }),
          record({ tokenId: 2, state: "Finished", claimedAt: 5n, finishTimeS: null, resultAt: 40n }),
        ],
        categories,
        10,
      );
      expect(items[0].kind).toBe("dnf");
      expect(items[1]).toMatchObject({ kind: "finished", finishTimeS: null });
    });

    it("names a distance it cannot find by its id rather than dropping the row", () => {
      const [item] = recentActivity([record({ categoryId: 9 })], categories, 1);
      expect(item.code).toBe("Distance 9");
    });
  });
});

describe("formatDuration", () => {
  it("writes minutes and seconds under an hour, and hours past it", () => {
    expect(formatDuration(3134)).toBe("52:14");
    expect(formatDuration(3761)).toBe("1:02:41");
    expect(formatDuration(59)).toBe("0:59");
  });
});

describe("timeAgo", () => {
  const now = 1_000_000n;
  it("reads like a person would say it", () => {
    expect(timeAgo(now - 20n, now)).toBe("just now");
    expect(timeAgo(now - 4n * 60n, now)).toBe("4 min ago");
    expect(timeAgo(now - 3n * 3600n, now)).toBe("3 h ago");
    expect(timeAgo(now - 30n * 3600n, now)).toBe("yesterday");
    expect(timeAgo(now - 5n * 86_400n, now)).toBe("5 days ago");
  });

  it("never says a time in the future is in the past", () => {
    expect(timeAgo(now + 100n, now)).toBe("just now");
  });
});
```

Create `fe/test/scanners.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import { fetchScanners } from "@/lib/scanners";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const ADDRESS = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";

beforeEach(() => vi.mocked(apiFetch).mockReset());

describe("fetchScanners", () => {
  describe("positive", () => {
    it("reads the fields the index sends today and leaves the rest empty", async () => {
      vi.mocked(apiFetch).mockResolvedValue({
        scanners: [{ address: ADDRESS, added_ledger: 120 }],
        last_ledger: 130,
      });
      expect(await fetchScanners(3)).toEqual([
        { address: ADDRESS, addedLedger: 120, addedAt: null, scans: null },
      ]);
      expect(apiFetch).toHaveBeenCalledWith("/events/3/scanners");
    });

    it("reads when a scanner was added and what it scanned, once the index sends them", async () => {
      vi.mocked(apiFetch).mockResolvedValue({
        scanners: [{ address: ADDRESS, added_ledger: 120, added_at: "1790000000", scans: 118 }],
        last_ledger: 130,
      });
      expect(await fetchScanners(3)).toEqual([
        { address: ADDRESS, addedLedger: 120, addedAt: 1_790_000_000n, scans: 118 },
      ]);
    });
  });

  describe("negative", () => {
    it("passes a refusal on rather than reading it as no scanners", async () => {
      vi.mocked(apiFetch).mockRejectedValue(new Error("not indexed"));
      await expect(fetchScanners(3)).rejects.toThrow("not indexed");
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter fe test test/race.test.ts test/scanners.test.ts`
Expected: FAIL, `Failed to resolve import "@/modules/organiser/race"` and `"@/lib/scanners"`.

- [ ] **Step 3: Carry the two new record fields**

In `fe/src/lib/records.ts`, add to `IndexedRecord` after `finishTimeS`:

```ts
  /** When the result was recorded. `null` until there is one. */
  resultAt: bigint | null;
  /**
   * The add-ons this runner bought, by id. `null` means the index does not
   * send them yet (backend ticket A in
   * docs/superpowers/plans/2026-09-13-org-event-console-tabs.md), which is not
   * the same as `[]`, a runner who bought none.
   */
  addonIds: number[] | null;
```

Add to `RecordJson` after `finish_time_s`:

```ts
  /** Optional in the type so a fixture from before this field still parses. */
  result_at?: string | null;
  /** Not sent yet; see `IndexedRecord.addonIds`. */
  addon_ids?: number[];
```

Add to the object returned by `toRecord` after `finishTimeS`:

```ts
    resultAt: row.result_at === null || row.result_at === undefined ? null : BigInt(row.result_at),
    addonIds: row.addon_ids ?? null,
```

Then find every hand-built `IndexedRecord` in the tests, which now fail to typecheck:

Run: `pnpm --filter fe typecheck`
Expected: errors of the form `Property 'resultAt' is missing`. In each file it names, add
`resultAt: null, addonIds: null,` to that fixture object. Re-run until clean.

- [ ] **Step 4: Write `lib/scanners.ts` and point the bell at it**

Create `fe/src/lib/scanners.ts`:

```ts
/**
 * Who may check runners in for a race, as the index reconstructs it.
 *
 * The chain cannot answer this: `is_scanner` takes an address and there is
 * nothing that enumerates (`be/CLAUDE.md`, the scanner list). Two fields are
 * read as optional because the index does not send them yet, when a scanner
 * was added and how many runners it checked in (backend ticket B). A table
 * that waited for them would not exist; a table that invented them would lie.
 */
import { apiFetch } from "@/lib/api";

export interface IndexedScanner {
  address: string;
  addedLedger: number;
  /** Unix seconds. `null` until the index sends it. */
  addedAt: bigint | null;
  /** Race packs this device handed out. `null` until the index sends it. */
  scans: number | null;
}

interface ScannerJson {
  address: string;
  added_ledger: number;
  added_at?: string;
  scans?: number;
}

export async function fetchScanners(eventId: number): Promise<IndexedScanner[]> {
  const body = await apiFetch<{ scanners: ScannerJson[]; last_ledger: number }>(
    `/events/${eventId}/scanners`,
  );
  return body.scanners.map((row) => ({
    address: row.address,
    addedLedger: row.added_ledger,
    addedAt: row.added_at === undefined ? null : BigInt(row.added_at),
    scans: row.scans ?? null,
  }));
}
```

Replace the contents of `fe/src/hooks/useScannerCounts.ts` from the `import { apiFetch }` line to
the end with:

```ts
import { fetchScanners } from "@/lib/scanners";

export function useScannerCounts(eventIds: readonly number[]): Map<number, number> {
  const results = useQueries({
    queries: eventIds.map((eventId) => ({
      queryKey: ["scanners", eventId] as const,
      queryFn: () => fetchScanners(eventId),
      staleTime: 60_000,
      retry: false,
    })),
  });

  const counts = new Map<number, number>();
  results.forEach((result, index) => {
    if (result.data) counts.set(eventIds[index], result.data.length);
  });
  return counts;
}
```

(keep its header comment and the `useQueries` import).

Create `fe/src/hooks/useRaceScanners.ts`:

```ts
"use client";

/**
 * One race's scanners. The key is the one `useScannerCounts` uses, so the bell
 * and the Scanners tab read one cache entry and a scanner added on the tab
 * clears the bell's warning without a reload.
 */
import { useQuery } from "@tanstack/react-query";

import { fetchScanners } from "@/lib/scanners";

export function useRaceScanners(eventId: number) {
  return useQuery({
    queryKey: ["scanners", eventId] as const,
    queryFn: () => fetchScanners(eventId),
    staleTime: 60_000,
    retry: false,
  });
}
```

- [ ] **Step 5: Write `race.ts`**

Create `fe/src/modules/organiser/race.ts`:

```ts
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
 * A number matches a bib exactly and never by prefix: an organiser typing 1
 * is not asking for bibs 10 to 19. Wallets match on any part, case-blind,
 * because people search with the four characters they can see on a phone.
 * Names are not searchable and never will be here: they are in the vault.
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
      return String(record.bibNo) === needle || record.runnerAddress.toUpperCase().includes(needle);
    })
    .sort((a, b) => (a.enteredAt === b.enteredAt ? a.tokenId - b.tokenId : a.enteredAt < b.enteredAt ? -1 : 1));
}

/**
 * Add-ons still owed to runners who have not collected their pack.
 *
 * `null`, not 0, when any record arrives without its add-ons: the index does
 * not send them yet, and a zero would tell an organiser there is nothing left
 * to hand out on the morning there is a box of shirts to hand out.
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
  const secs = seconds % 60;
  const ss = String(secs).padStart(2, "0");
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
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `pnpm --filter fe test test/race.test.ts test/scanners.test.ts test/OrganiserHome.test.tsx`
Expected: PASS.
Run: `pnpm --filter fe typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add fe/src/lib/records.ts fe/src/lib/scanners.ts fe/src/hooks/useScannerCounts.ts \
  fe/src/hooks/useRaceScanners.ts fe/src/modules/organiser/race.ts fe/test
git commit -m "fe: the sums behind one race's console page (STE-17)" -m "Per-entry add-ons, when a scanner was added and how many it scanned are read as optional: the index does not send them yet, and the page is built to the design rather than to today's API, so each column appears once its backend ticket lands."
```

---

## Task 2: The route, the frame of the page, and its tabs

**Files:**
- Create: `fe/src/modules/organiser/race-tab.ts`
- Create: `fe/app/(organiser)/org/(console)/events/[eventId]/page.tsx`
- Create: `fe/app/(organiser)/org/(console)/not-found.tsx`
- Create: `fe/src/modules/organiser/component/RaceTabs.tsx`
- Create: `fe/src/modules/organiser/RaceConsole.tsx`
- Test: `fe/test/race-tab.test.ts`, `fe/test/RaceConsole.test.tsx`
- Modify: `fe/test/console-chrome.test.tsx`

**Interfaces:**
- Consumes: `useEvent(eventId)` from `@/hooks/useEvents`; `ConsoleHeader`, `UrgentBanner`,
  `useNeedsContext` from the first plan.
- Produces, `race-tab.ts`: `RACE_TABS`, `type RaceTab = "overview" | "entries" | "scanners"`,
  `parseRaceTab(value: string | string[] | undefined): RaceTab`,
  `raceTabHref(eventId: number, tab: RaceTab): string`.
- Produces, `RaceConsole.tsx`: `RaceConsole({ eventId, tab }: { eventId: number; tab: RaceTab })`.
  Later tasks add one line each inside its body; the body is marked by the comment
  `{/* tab bodies */}`.

Why `race-tab.ts` is its own file with no `"use client"`: the route is a server component and
imports `parseRaceTab`. A function imported from a client module into a server component arrives as
a client reference, not as a function it can call.

- [ ] **Step 1: Write the failing tests**

Create `fe/test/race-tab.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseRaceTab, raceTabHref } from "@/modules/organiser/race-tab";

describe("parseRaceTab", () => {
  describe("positive", () => {
    it("takes the three tabs that exist", () => {
      expect(parseRaceTab("overview")).toBe("overview");
      expect(parseRaceTab("entries")).toBe("entries");
      expect(parseRaceTab("scanners")).toBe("scanners");
    });
  });

  describe("negative", () => {
    it("lands on Overview for a tab that does not exist yet", () => {
      // The bell already links results to ?tab=results. Until that tab is
      // built the link must still open the race, not a blank page.
      expect(parseRaceTab("results")).toBe("overview");
      expect(parseRaceTab("banana")).toBe("overview");
    });
  });

  describe("edge", () => {
    it("reads the first of a repeated parameter and treats none as Overview", () => {
      expect(parseRaceTab(["scanners", "entries"])).toBe("scanners");
      expect(parseRaceTab(undefined)).toBe("overview");
    });
  });
});

describe("raceTabHref", () => {
  it("gives Overview the bare address and the others a tab parameter", () => {
    expect(raceTabHref(4, "overview")).toBe("/org/events/4");
    expect(raceTabHref(4, "scanners")).toBe("/org/events/4?tab=scanners");
  });
});
```

Create `fe/test/RaceConsole.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "@/components/ui/sidebar";
import { useWallet } from "@/hooks/useWallet";
import { RaceConsole } from "@/modules/organiser/RaceConsole";
import { NeedsProvider } from "@/modules/organiser/component/NeedsContext";
import type { Need } from "@/modules/organiser/needs";
import type { RaceTab } from "@/modules/organiser/race-tab";
import type { SterunCategory, SterunEvent } from "@sterunxyz/sdk";

const readClient = vi.hoisted(() => ({
  getEvent: vi.fn(),
  listCategories: vi.fn(),
  listAddOns: vi.fn(),
  setEventStatus: vi.fn(),
  addScanner: vi.fn(),
  removeScanner: vi.fn(),
}));
vi.mock("@/lib/sterun", () => ({ readClient }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(() => Promise.reject(new Error("the index is unreachable"))),
}));
vi.mock("@/lib/wallet", () => ({
  initWallet: vi.fn(),
  restoreAddress: vi.fn(async () => null),
  onWalletStateChange: vi.fn(() => () => {}),
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  signTransaction: vi.fn(),
  signMessage: vi.fn(),
  walletErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

const ORGANISER = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";
const SOMEONE_ELSE = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";

function event(overrides: Partial<SterunEvent> = {}): SterunEvent {
  return {
    eventId: 4,
    organiser: ORGANISER,
    name: "Fun Run Sleman",
    metadataHash: "a".repeat(64),
    uri: "",
    startsAt: 1_790_548_200n,
    status: "Open",
    ...overrides,
  };
}

function category(overrides: Partial<SterunCategory> = {}): SterunCategory {
  return {
    eventId: 4,
    categoryId: 0,
    code: "5K",
    distanceM: 5_000,
    quota: 200,
    enteredCount: 120,
    priceStroops: 100_000_000n,
    slotsLeft: 80,
    ...overrides,
  };
}

function renderRace(tab: RaceTab = "overview", needs: Need[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(
    <SidebarProvider>
      <NeedsProvider needs={needs}>
        <RaceConsole eventId={4} tab={tab} />
      </NeedsProvider>
    </SidebarProvider>,
    { wrapper: Wrapper },
  );
}

beforeEach(() => {
  for (const fn of Object.values(readClient)) fn.mockReset();
  readClient.getEvent.mockResolvedValue(event());
  readClient.listCategories.mockResolvedValue([category()]);
  readClient.listAddOns.mockResolvedValue([]);
  useWallet.setState({ address: ORGANISER, isRestoring: false, isConnecting: false, error: null });
});

describe("RaceConsole", () => {
  describe("positive", () => {
    it("titles the page with the race and marks the tab being read", async () => {
      renderRace("scanners");

      expect(await screen.findByRole("heading", { name: /Fun Run Sleman/ })).toBeInTheDocument();
      const tabs = screen.getByRole("navigation", { name: "Race sections" });
      const links = within(tabs).getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual(["Overview", "Entries", "Scanners"]);
      expect(within(tabs).getByRole("link", { name: "Scanners" })).toHaveAttribute("aria-current", "page");
      expect(within(tabs).getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
    });

    it("interrupts for this race's own urgent need", async () => {
      renderRace("overview", [
        {
          kind: "scanner",
          eventId: 4,
          eventName: "Fun Run Sleman",
          urgent: true,
          title: "Add a scanner - Fun Run Sleman",
          detail: "Runs in 3 days. Nobody can check runners in.",
          action: "Add a scanner",
          href: "/org/events/4?tab=scanners",
        },
      ]);

      expect(await screen.findByRole("note")).toHaveTextContent("Nobody can check runners in.");
    });
  });

  describe("negative", () => {
    it("does not offer to manage a race another wallet created", async () => {
      // Anyone can read a race; only its organiser can change it. Tabs full of
      // buttons that all fail would be worse than saying so once.
      readClient.getEvent.mockResolvedValue(event({ organiser: SOMEONE_ELSE }));
      renderRace();

      expect(await screen.findByText("This race belongs to another wallet")).toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "Race sections" })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Back to your races" })).toHaveAttribute("href", "/org");
    });

    it("does not interrupt for another race's need", async () => {
      renderRace("overview", [
        {
          kind: "scanner",
          eventId: 9,
          eventName: "Another race",
          urgent: true,
          title: "Add a scanner - Another race",
          detail: "Runs in 2 days. Nobody can check runners in.",
          action: "Add a scanner",
          href: "/org/events/9?tab=scanners",
        },
      ]);

      await screen.findByRole("heading", { name: /Fun Run Sleman/ });
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("says the race could not be loaded rather than drawing an empty one", async () => {
      readClient.getEvent.mockRejectedValue(new Error("node down"));
      renderRace();

      expect(await screen.findByRole("alert")).toHaveTextContent("We could not load this race");
    });
  });
});
```

Append to `fe/test/console-chrome.test.tsx`, after the imports add
`import ConsoleNotFound from "../app/(organiser)/org/(console)/not-found";`, and at the end of the
file add:

```tsx
describe("a race id the console cannot find", () => {
  describe("negative", () => {
    it("draws no site header over the rail and only one landmark", async () => {
      // notFound() from /org/events/banana lands INSIDE the console layout,
      // which has already drawn the rail and the <main>. The root not-found
      // would add the site header and a second <main> on top of both.
      render(
        <ConsoleLayout>
          <ConsoleNotFound />
        </ConsoleLayout>,
        { wrapper: Wrapper },
      );

      expect(await screen.findByRole("link", { name: "Browse races" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Sterun home" })).not.toBeInTheDocument();
      expect(screen.getAllByRole("main")).toHaveLength(1);
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter fe test test/race-tab.test.ts test/RaceConsole.test.tsx test/console-chrome.test.tsx`
Expected: FAIL on unresolved imports `@/modules/organiser/race-tab`, `@/modules/organiser/RaceConsole`
and `../app/(organiser)/org/(console)/not-found`.

- [ ] **Step 3: Write `race-tab.ts`**

```ts
/**
 * The tabs of one race, and how they live in the address.
 *
 * In the address rather than in component state, for two reasons that both
 * showed up before this file existed: the bell links straight to
 * `?tab=scanners`, and the rail sits in a layout that must not remount between
 * console pages, so the tab has to be something a link can set.
 *
 * Results is not listed. It is deferred (see the plan this came from), and an
 * old link to it opens Overview rather than a page with nothing on it.
 *
 * No "use client": the route, a server component, imports `parseRaceTab`.
 */
export const RACE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "entries", label: "Entries" },
  { id: "scanners", label: "Scanners" },
] as const;

export type RaceTab = (typeof RACE_TABS)[number]["id"];

export function parseRaceTab(value: string | string[] | undefined): RaceTab {
  const first = Array.isArray(value) ? value[0] : value;
  const found = RACE_TABS.find((tab) => tab.id === first);
  return found ? found.id : "overview";
}

export function raceTabHref(eventId: number, tab: RaceTab): string {
  return tab === "overview" ? `/org/events/${eventId}` : `/org/events/${eventId}?tab=${tab}`;
}
```

- [ ] **Step 4: Write the route and the console 404**

`fe/app/(organiser)/org/(console)/events/[eventId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";

import { RaceConsole } from "@/modules/organiser/RaceConsole";
import { parseRaceTab } from "@/modules/organiser/race-tab";

/**
 * One race in the console. Event ids are sequential u32 from zero, so anything
 * else in the slot is a bad link; it goes to the console's own not-found,
 * which draws inside the rail rather than under a second header.
 */
export default async function RacePage({
  params,
  searchParams,
}: PageProps<"/org/events/[eventId]">) {
  const { eventId } = await params;
  if (!/^\d+$/.test(eventId)) notFound();
  const { tab } = await searchParams;

  return <RaceConsole eventId={Number(eventId)} tab={parseRaceTab(tab)} />;
}
```

`fe/app/(organiser)/org/(console)/not-found.tsx`:

```tsx
import { NotFoundMessage } from "@/components/layouts/NotFoundMessage";

/**
 * The console layout has already drawn the rail and the <main> by the time a
 * console page calls notFound(), so this supplies no chrome of its own. The
 * rule, from fe/CLAUDE.md: a boundary file supplies the chrome only if its own
 * layouts do not.
 */
export default function ConsoleNotFound() {
  return <NotFoundMessage />;
}
```

If `pnpm --filter fe typecheck` later reports that `PageProps<"/org/events/[eventId]">` is unknown,
that is `next typegen` not having seen the new route yet; the `typecheck` script runs it first, so
run the script rather than bare `tsc`.

- [ ] **Step 5: Write `RaceTabs.tsx`**

```tsx
/**
 * The tab strip, as links. `aria-current` rather than a tablist: each tab is a
 * different address, and a screen reader should announce a page, not a widget.
 *
 * It scrolls sideways at phone width and never wraps. Scanners is the tab
 * somebody opens standing at the gate, so it must stay on the strip.
 */
import Link from "next/link";

import { RACE_TABS, raceTabHref, type RaceTab } from "../race-tab";

export function RaceTabs({ eventId, current }: { eventId: number; current: RaceTab }) {
  return (
    <nav
      aria-label="Race sections"
      className="overflow-x-auto overflow-y-hidden border-b border-n-200 bg-paper px-4 md:px-6"
    >
      <ul className="flex min-w-max gap-6">
        {RACE_TABS.map((tab) => {
          const on = tab.id === current;
          return (
            <li key={tab.id}>
              <Link
                href={raceTabHref(eventId, tab.id)}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={
                  on
                    ? "-mb-px block border-b-2 border-teal py-3 text-sm font-medium text-ink"
                    : "-mb-px block border-b-2 border-transparent py-3 text-sm text-n-500 hover:text-ink"
                }
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 6: Write `RaceConsole.tsx`**

```tsx
"use client";

/**
 * STE-17 - `/org/events/[id]`, one race.
 *
 * Read fresh from the chain with `useEvent`, not picked out of the dashboard's
 * list: this is the page an organiser changes the race from, and what it shows
 * after a signature has to be the race as it now is.
 *
 * A race another wallet created is readable by anyone and manageable by nobody
 * but its organiser, so it gets one sentence and a way back, not three tabs of
 * buttons that would each fail at the wallet prompt.
 */
import Link from "next/link";

import { EmptyState } from "@/components/elements/EmptyState";
import { ErrorNotice } from "@/components/elements/ErrorNotice";
import { EventStatusBadge } from "@/components/elements/EventStatusBadge";
import { useEvent } from "@/hooks/useEvents";
import { useWallet } from "@/hooks/useWallet";

import { ConsoleHeader } from "./component/ConsoleHeader";
import { useNeedsContext } from "./component/NeedsContext";
import { RaceTabs } from "./component/RaceTabs";
import { UrgentBanner } from "./component/UrgentBanner";
import type { RaceTab } from "./race-tab";

export function RaceConsole({ eventId, tab }: { eventId: number; tab: RaceTab }) {
  const { address } = useWallet();
  const { data, isPending, isError, refetch } = useEvent(eventId);
  const needs = useNeedsContext();

  // The console layout's gate has already established there is one.
  if (!address) return null;

  if (isPending) {
    return (
      <>
        <ConsoleHeader title="Race" />
        <div role="status" aria-label="Loading this race" className="flex flex-col gap-3 px-4 py-6 md:px-6">
          <div className="h-24 animate-pulse rounded-lg bg-n-100" />
          <div className="h-64 animate-pulse rounded-lg bg-n-100" />
        </div>
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <ConsoleHeader title="Race" />
        <div className="px-4 py-6 md:px-6">
          <ErrorNotice
            title="We could not load this race"
            detail="This is a connection problem, or the link points at a race that does not exist. Please try again."
            onRetry={() => void refetch()}
          />
        </div>
      </>
    );
  }

  if (data.event.organiser !== address) {
    return (
      <>
        <ConsoleHeader title={data.event.name} />
        <div className="px-4 py-6 md:px-6">
          <EmptyState title="This race belongs to another wallet">
            Only the wallet that created a race can manage it.{" "}
            <Link href="/org" className="text-teal underline">
              Back to your races
            </Link>
          </EmptyState>
        </div>
      </>
    );
  }

  // The same rule as the dashboard: one interruption at most, and only this
  // race's. The bell still carries every race's needs.
  const urgent = needs.find((need) => need.urgent && need.eventId === eventId);

  return (
    <>
      <ConsoleHeader
        title={data.event.name}
        badge={<EventStatusBadge status={data.event.status} />}
      />
      <RaceTabs eventId={eventId} current={tab} />
      <div className="flex flex-1 flex-col gap-3 px-4 py-6 md:px-6">
        {urgent ? <UrgentBanner need={urgent} /> : null}
        {/* tab bodies */}
      </div>
    </>
  );
}
```

- [ ] **Step 7: Run the tests and the typecheck**

Run: `pnpm --filter fe test test/race-tab.test.ts test/RaceConsole.test.tsx test/console-chrome.test.tsx`
Expected: PASS.
Run: `pnpm --filter fe typecheck && pnpm --filter fe lint`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add "fe/app/(organiser)/org/(console)" fe/src/modules/organiser/race-tab.ts \
  fe/src/modules/organiser/RaceConsole.tsx fe/src/modules/organiser/component/RaceTabs.tsx fe/test
git commit -m "fe: give each race its own console page and tabs (STE-17)" -m "The tab lives in the address because the bell already links to ?tab=scanners and the rail must not remount between races. The console gets its own not-found so notFound() does not draw the site header over the rail."
```

---

## Task 3: The status action in the header

**Files:**
- Create: `fe/src/modules/organiser/status-action.ts`
- Create: `fe/src/modules/organiser/component/StatusAction.tsx`
- Modify: `fe/src/modules/organiser/RaceConsole.tsx`
- Test: `fe/test/status-action.test.ts`, `fe/test/StatusAction.test.tsx`

**Interfaces:**
- Consumes: `useSetEventStatus()` from `@/hooks/useOrganiser` (`write({ eventId, status })`,
  `phase`, `isBusy`, `error`, `reset`); `eventKeys` from `@/hooks/useEvents`; `friendlyError`.
- Produces: `statusAction(status: EventStatus, startsAt: bigint, nowS: bigint | undefined): StatusMove | null`
  with `interface StatusMove { to: "Open" | "Closed"; label: string; title: string; body: string; confirm: string }`;
  `StatusAction({ summary }: { summary: EventSummary })`.

The allowed transitions come from the contract (spec, "Draft leaves the interface"):
`Draft → Open | Closed | Cancelled`, `Open → Closed | Completed | Cancelled`,
`Closed → Open | Completed | Cancelled`. This task offers only opening and closing entries.
Completing belongs with Results, and cancelling is a separate, destructive decision nobody has
designed yet.

- [ ] **Step 1: Write the failing tests**

`fe/test/status-action.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { statusAction } from "@/modules/organiser/status-action";

const NOW = 1_000_000n;
const LATER = NOW + 86_400n;
const EARLIER = NOW - 86_400n;

describe("statusAction", () => {
  describe("positive", () => {
    it("opens a race that is not open yet, and says it cannot be undone", () => {
      const move = statusAction("Draft", LATER, NOW);
      expect(move).toMatchObject({ to: "Open", label: "Open entries", confirm: "Sign and open" });
      // A cost warning, so it is in the dialog's own text and never a tooltip.
      expect(move?.body).toContain("can never go back");
    });

    it("closes an open race, before or after race day", () => {
      expect(statusAction("Open", LATER, NOW)).toMatchObject({ to: "Closed", label: "Close entries" });
      expect(statusAction("Open", EARLIER, NOW)).toMatchObject({ to: "Closed" });
    });

    it("reopens a closed race that has not run yet", () => {
      expect(statusAction("Closed", LATER, NOW)).toMatchObject({ to: "Open", label: "Reopen entries" });
    });
  });

  describe("negative", () => {
    it("offers nothing on a race that is over or called off", () => {
      expect(statusAction("Completed", EARLIER, NOW)).toBeNull();
      expect(statusAction("Cancelled", LATER, NOW)).toBeNull();
    });

    it("does not reopen entries for a race that has already run", () => {
      expect(statusAction("Closed", EARLIER, NOW)).toBeNull();
    });

    it("does not open entries for a race that has already run", () => {
      expect(statusAction("Draft", EARLIER, NOW)).toBeNull();
    });
  });

  describe("edge", () => {
    it("does not guess about race day before the clock is known", () => {
      // The first render has no clock (useNowSeconds). Reopening depends on
      // race day, so it waits; opening and closing do not need to.
      expect(statusAction("Closed", LATER, undefined)).toBeNull();
      expect(statusAction("Draft", LATER, undefined)).toMatchObject({ to: "Open" });
      expect(statusAction("Open", LATER, undefined)).toMatchObject({ to: "Closed" });
    });
  });
});
```

`fe/test/StatusAction.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWallet } from "@/hooks/useWallet";
import type { EventSummary } from "@/lib/events";
import { StatusAction } from "@/modules/organiser/component/StatusAction";

const readClient = vi.hoisted(() => ({ setEventStatus: vi.fn() }));
vi.mock("@/lib/sterun", () => ({ readClient }));
vi.mock("@/lib/wallet", () => ({
  initWallet: vi.fn(),
  restoreAddress: vi.fn(async () => null),
  onWalletStateChange: vi.fn(() => () => {}),
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  signTransaction: vi.fn(),
  signMessage: vi.fn(),
  walletErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

const ORGANISER = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";

function summary(status: EventSummary["event"]["status"]): EventSummary {
  return {
    event: {
      eventId: 4,
      organiser: ORGANISER,
      name: "Fun Run Sleman",
      metadataHash: "a".repeat(64),
      uri: "",
      // Far enough ahead that no test depends on today's date.
      startsAt: 4_000_000_000n,
      status,
    },
    categories: [],
  };
}

function renderAction(status: EventSummary["event"]["status"]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<StatusAction summary={summary(status)} />, { wrapper: Wrapper });
}

beforeEach(() => {
  readClient.setEventStatus.mockReset();
  useWallet.setState({ address: ORGANISER, isRestoring: false, isConnecting: false, error: null });
});

describe("StatusAction", () => {
  describe("positive", () => {
    it("asks before opening entries, then signs and closes the dialog", async () => {
      readClient.setEventStatus.mockResolvedValue({ value: undefined, txHash: "ab", ledger: 1 });
      renderAction("Draft");

      await userEvent.click(screen.getByRole("button", { name: "Open entries" }));
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent("can never go back");

      await userEvent.click(screen.getByRole("button", { name: "Sign and open" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(readClient.setEventStatus).toHaveBeenCalledWith(4, "Open", expect.objectContaining({ publicKey: ORGANISER }));
    });
  });

  describe("negative", () => {
    it("keeps the dialog open and says so when signing fails", async () => {
      readClient.setEventStatus.mockRejectedValue(new Error("boom"));
      renderAction("Open");

      await userEvent.click(screen.getByRole("button", { name: "Close entries" }));
      await userEvent.click(await screen.findByRole("button", { name: "Sign and close" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("draws nothing for a race with no move to offer", () => {
      const { container } = renderAction("Completed");
      expect(container).toBeEmptyDOMElement();
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter fe test test/status-action.test.ts test/StatusAction.test.tsx`
Expected: FAIL on unresolved imports.

- [ ] **Step 3: Write `status-action.ts`**

```ts
/**
 * Which lifecycle move a race offers from its header, if any.
 *
 * One button, never a menu: the header holds one action (ConsoleHeader). The
 * words are written here, next to the rule that picks them, so a test can hold
 * the one sentence that costs something: once entries open, a race can never
 * return to not open. That is the contract's rule, and it is stated in the
 * dialog itself because a warning with a cost does not go in a tooltip.
 */
import type { EventStatus } from "@sterunxyz/sdk";

export interface StatusMove {
  to: "Open" | "Closed";
  label: string;
  title: string;
  body: string;
  confirm: string;
}

const OPEN: StatusMove = {
  to: "Open",
  label: "Open entries",
  title: "Open entries?",
  body: "Runners can find this race and enter it from now on. Once entries have opened, this race can never go back to not open. You can still close entries later.",
  confirm: "Sign and open",
};

const CLOSE: StatusMove = {
  to: "Closed",
  label: "Close entries",
  title: "Close entries?",
  body: "Nobody new can enter until you open entries again. Everyone who has entered keeps their place.",
  confirm: "Sign and close",
};

const REOPEN: StatusMove = {
  to: "Open",
  label: "Reopen entries",
  title: "Reopen entries?",
  body: "Runners can enter again until the race is full or you close entries.",
  confirm: "Sign and reopen",
};

export function statusAction(
  status: EventStatus,
  startsAt: bigint,
  nowS: bigint | undefined,
): StatusMove | null {
  const hasRun = nowS !== undefined && startsAt <= nowS;
  switch (status) {
    case "Draft":
      return hasRun ? null : OPEN;
    case "Open":
      return CLOSE;
    case "Closed":
      // Reopening needs to know the race has not run, so it waits for a clock.
      return nowS !== undefined && !hasRun ? REOPEN : null;
    default:
      return null;
  }
}
```

- [ ] **Step 4: Write `StatusAction.tsx`**

```tsx
"use client";

/**
 * The header's one action on a race page: open, close or reopen entries.
 *
 * Always behind a dialog, even for closing, because every one of these is a
 * signature and a button that raises a wallet with no warning has already
 * surprised somebody. The dialog cannot be dismissed while the signature is in
 * flight: closing it would hide the only place the outcome is reported.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { eventKeys } from "@/hooks/useEvents";
import { useNowSeconds } from "@/hooks/useNowSeconds";
import { useSetEventStatus } from "@/hooks/useOrganiser";
import type { EventSummary } from "@/lib/events";
import { friendlyError } from "@/lib/errors";

import { statusAction } from "../status-action";

export function StatusAction({ summary }: { summary: EventSummary }) {
  const nowS = useNowSeconds();
  const queryClient = useQueryClient();
  const { write, phase, isBusy, error, reset } = useSetEventStatus();
  const [open, setOpen] = useState(false);

  const move = statusAction(summary.event.status, summary.event.startsAt, nowS);
  if (!move) return null;

  async function confirm() {
    if (!move) return;
    try {
      await write({ eventId: summary.event.eventId, status: move.to });
      // Every read that holds this race's status: the page, the rail, the
      // dashboard and the bell all start from the "events" key.
      await queryClient.invalidateQueries({ queryKey: eventKeys.all });
      setOpen(false);
      reset();
    } catch {
      // `error` carries it into the dialog; nothing else to do here.
    }
  }

  const busyLabel = phase === "signing" ? "Confirm in your wallet" : "Saving";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isBusy) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button variant="outline" onClick={() => setOpen(true)}>
        {move.label}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{move.title}</DialogTitle>
          <DialogDescription>{move.body}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {friendlyError(error)}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={isBusy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={isBusy} onClick={() => void confirm()}>
            {isBusy ? busyLabel : move.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Check the `outline` variant exists in `fe/src/components/ui/button.tsx`
(`grep -n "outline" fe/src/components/ui/button.tsx`). If it is not there, use `secondary` in both
places.

- [ ] **Step 5: Put it in the header**

In `fe/src/modules/organiser/RaceConsole.tsx` add the import
`import { StatusAction } from "./component/StatusAction";` and change the connected `ConsoleHeader`
to:

```tsx
      <ConsoleHeader
        title={data.event.name}
        badge={<EventStatusBadge status={data.event.status} />}
        action={<StatusAction summary={data} />}
      />
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `pnpm --filter fe test test/status-action.test.ts test/StatusAction.test.tsx test/RaceConsole.test.tsx`
Expected: PASS.
Run: `pnpm --filter fe typecheck && pnpm --filter fe lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add fe/src/modules/organiser/status-action.ts fe/src/modules/organiser/component/StatusAction.tsx \
  fe/src/modules/organiser/RaceConsole.tsx fe/test
git commit -m "fe: open and close entries from the race page (STE-17)" -m "Every move is a signature, so each goes through a dialog, and the dialog for opening says the one thing that cannot be undone: a race that has opened never returns to not open."
```

---

## Task 4: Entries per day, and the distance rings

**Files:**
- Modify: `fe/src/modules/organiser/chart.ts`
- Create: `fe/src/modules/organiser/component/EntriesPerDay.tsx`
- Create: `fe/src/modules/organiser/component/DistanceRings.tsx`
- Test: `fe/test/chart.test.ts` (append), `fe/test/race-charts.test.tsx`

**Interfaces:**
- Produces, `chart.ts`:
  - `niceCeiling(top: number): number` — the smallest multiple of 5 at or above `top`, at least 5
  - `areaPaths(values: readonly number[], box: { x0: number; x1: number; yTop: number; yBase: number }, ceiling: number): { line: string; area: string; points: [number, number][] } | null`
  - `halfRingPath(cx: number, cy: number, r: number): string`
- Produces: `EntriesPerDay({ values, nowS }: { values: readonly number[]; nowS: bigint })`,
  `DistanceRings({ categories }: { categories: readonly SterunCategory[] })`.

If `fe/test/chart.test.ts` does not exist (check with `ls fe/test | grep -i chart`), create it with
the imports shown below; if it does, append only the `describe` blocks and merge the import line.

- [ ] **Step 1: Write the failing tests**

Append to `fe/test/chart.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { areaPaths, halfRingPath, niceCeiling } from "@/modules/organiser/chart";

describe("niceCeiling", () => {
  it("rounds up to a multiple of five, never below five", () => {
    expect(niceCeiling(0)).toBe(5);
    expect(niceCeiling(5)).toBe(5);
    expect(niceCeiling(22)).toBe(25);
  });
});

describe("areaPaths", () => {
  const box = { x0: 0, x1: 100, yTop: 0, yBase: 50 };

  describe("positive", () => {
    it("spreads the days across the box and scales them to the ceiling", () => {
      const drawn = areaPaths([0, 5, 10], box, 10);
      expect(drawn?.points).toEqual([
        [0, 50],
        [50, 25],
        [100, 0],
      ]);
      expect(drawn?.area.endsWith("L 100,50 L 0,50 Z")).toBe(true);
    });
  });

  describe("negative", () => {
    it("draws nothing for a fortnight with no entries", () => {
      // A line along the bottom reads as a measured zero, and the panel says
      // "no entries" in words instead.
      expect(areaPaths([0, 0, 0], box, 5)).toBeNull();
      expect(areaPaths([], box, 5)).toBeNull();
    });
  });

  describe("edge", () => {
    it("centres a single day rather than dividing by zero", () => {
      const drawn = areaPaths([3], box, 5);
      expect(drawn?.points).toEqual([[50, 20]]);
      expect(drawn?.line).not.toContain("NaN");
    });
  });
});

describe("halfRingPath", () => {
  it("draws the top half of a circle, left to right", () => {
    expect(halfRingPath(150, 160, 132)).toBe("M 18,160 A 132,132 0 0 1 282,160");
  });
});
```

Create `fe/test/race-charts.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DistanceRings } from "@/modules/organiser/component/DistanceRings";
import { EntriesPerDay } from "@/modules/organiser/component/EntriesPerDay";
import type { SterunCategory } from "@sterunxyz/sdk";

const NOW = 1_788_000_000n;

function category(code: string, distanceM: number, quota: number, enteredCount: number): SterunCategory {
  return {
    eventId: 4,
    categoryId: distanceM,
    code,
    distanceM,
    quota,
    enteredCount,
    priceStroops: 0n,
    slotsLeft: quota - enteredCount,
  };
}

describe("EntriesPerDay", () => {
  describe("positive", () => {
    it("describes the fortnight in words for anyone who cannot see the line", () => {
      render(<EntriesPerDay values={[1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 22]} nowS={NOW} />);
      expect(screen.getByRole("img")).toHaveAccessibleName(
        "Entries per day over the last 14 days, 32 in total, 22 on the busiest day",
      );
    });

    it("shows the day under the pointer", () => {
      render(<EntriesPerDay values={[1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 22]} nowS={NOW} />);
      fireEvent.mouseEnter(screen.getAllByTestId("day-hit").at(-1)!);
      expect(screen.getByText("22 entries")).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("says there were no entries instead of drawing a line at zero", () => {
      const { container } = render(<EntriesPerDay values={Array(14).fill(0)} nowS={NOW} />);
      expect(screen.getByText("No entries in the last 14 days")).toBeInTheDocument();
      expect(container.querySelector("svg path")).toBeNull();
    });
  });

  describe("edge", () => {
    it("writes one entry in the singular", () => {
      render(<EntriesPerDay values={[...Array(13).fill(0), 1]} nowS={NOW} />);
      fireEvent.mouseEnter(screen.getAllByTestId("day-hit").at(-1)!);
      expect(screen.getByText("1 entry")).toBeInTheDocument();
    });
  });
});

describe("DistanceRings", () => {
  describe("positive", () => {
    it("keys the distances longest first with their counts", () => {
      render(
        <DistanceRings
          categories={[category("5K", 5_000, 200, 200), category("21K", 21_000, 100, 14), category("10K", 10_000, 200, 98)]}
        />,
      );
      const rows = screen.getAllByRole("listitem");
      expect(rows.map((row) => row.textContent)).toEqual(["21K14 / 100", "10K98 / 200", "5KFull200 / 200"]);
      expect(screen.getByRole("img")).toHaveAccessibleName("21K 14 percent, 10K 49 percent, 5K full");
    });
  });

  describe("negative", () => {
    it("draws no arc for a distance nobody has entered", () => {
      // A round cap on a zero-length dash still paints a dot, which reads as
      // an entry that does not exist.
      const { container } = render(<DistanceRings categories={[category("10K", 10_000, 200, 0)]} />);
      expect(container.querySelectorAll('path[data-part="fill"]')).toHaveLength(0);
      expect(container.querySelectorAll('path[data-part="track"]')).toHaveLength(1);
    });
  });

  describe("edge", () => {
    it("says so when the race has no distances", () => {
      render(<DistanceRings categories={[]} />);
      expect(screen.getByText("No distances")).toBeInTheDocument();
    });

    it("never divides by a quota of zero", () => {
      const { container } = render(<DistanceRings categories={[category("10K", 10_000, 0, 0)]} />);
      expect(container.innerHTML).not.toContain("NaN");
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter fe test test/chart.test.ts test/race-charts.test.tsx`
Expected: FAIL, the three new exports and both components do not exist.

- [ ] **Step 3: Add the geometry to `chart.ts`**

Append to `fe/src/modules/organiser/chart.ts`:

```ts
/** The top of a count axis: a round number, and never a scale of zero. */
export function niceCeiling(top: number): number {
  return Math.max(5, Math.ceil(top / 5) * 5);
}

export interface PlotBox {
  x0: number;
  x1: number;
  yTop: number;
  yBase: number;
}

/**
 * The line and the filled area under it for a run of daily counts.
 *
 * `null` when every day is zero, for the same reason `sparklinePath` returns
 * one: a line along the floor claims a measurement, and the panel says "no
 * entries" in words instead. `points` is returned too, because the hover
 * marker has to sit exactly on the line it describes.
 */
export function areaPaths(
  values: readonly number[],
  box: PlotBox,
  ceiling: number,
): { line: string; area: string; points: [number, number][] } | null {
  if (values.length === 0 || Math.max(...values) <= 0 || ceiling <= 0) return null;

  const span = box.x1 - box.x0;
  const points = values.map((value, index): [number, number] => {
    const x = values.length === 1 ? box.x0 + span / 2 : box.x0 + (index / (values.length - 1)) * span;
    const y = box.yBase - (Math.min(value, ceiling) / ceiling) * (box.yBase - box.yTop);
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
  });

  const line = smoothPath(points);
  const last = points[points.length - 1];
  const area = `${line} L ${n(last[0])},${n(box.yBase)} L ${n(points[0][0])},${n(box.yBase)} Z`;
  return { line, area, points };
}

/** The upper half of a circle centred on (cx, cy), drawn left to right. */
export function halfRingPath(cx: number, cy: number, r: number): string {
  return `M ${n(cx - r)},${n(cy)} A ${n(r)},${n(r)} 0 0 1 ${n(cx + r)},${n(cy)}`;
}
```

- [ ] **Step 4: Write `EntriesPerDay.tsx`**

```tsx
"use client";

/**
 * Entries per day for the last fortnight: a smooth area, gridlines, and a
 * marker that follows the pointer.
 *
 * With no entries at all the panel keeps its height and says so, and draws no
 * shape: the same rule as the dashboard's panels (fe/CLAUDE.md, "A chart with
 * no data").
 */
import { useState } from "react";

import { areaPaths, niceCeiling } from "../chart";

const BOX = { x0: 44, x1: 606, yTop: 16, yBase: 148 };
const DAY = 86_400n;

function dayOf(nowS: bigint, index: number, days: number): Date {
  return new Date(Number(nowS - BigInt(days - 1 - index) * DAY) * 1000);
}

const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function EntriesPerDay({ values, nowS }: { values: readonly number[]; nowS: bigint }) {
  const [hover, setHover] = useState<number | null>(null);
  const ceiling = niceCeiling(Math.max(0, ...values));
  const drawn = areaPaths(values, BOX, ceiling);
  const total = values.reduce((sum, value) => sum + value, 0);
  const busiest = Math.max(0, ...values);
  const days = values.length;
  const step = days > 1 ? (BOX.x1 - BOX.x0) / (days - 1) : BOX.x1 - BOX.x0;

  return (
    <section className="flex flex-col rounded-lg border border-n-200 bg-paper p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="heading-strong text-sm text-ink">Entries per day</h2>
        <p className="text-xs whitespace-nowrap text-n-500">Last {days} days</p>
      </div>

      <div className="relative">
        <svg
          viewBox="0 0 620 176"
          role="img"
          aria-label={
            drawn
              ? `Entries per day over the last ${days} days, ${total} in total, ${busiest} on the busiest day`
              : `Entries per day over the last ${days} days. No entries.`
          }
          className="h-auto w-full"
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="entries-per-day-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-teal)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--color-teal)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {drawn
            ? [0, 1, 2, 3, 4, 5].map((mark) => {
                const value = (ceiling / 5) * mark;
                const y = BOX.yBase - (mark / 5) * (BOX.yBase - BOX.yTop);
                return (
                  <g key={mark}>
                    <line x1={BOX.x0} y1={y} x2={BOX.x1} y2={y} stroke="var(--color-n-100)" strokeWidth="1" />
                    <text x={BOX.x0 - 9} y={y + 3.5} textAnchor="end" fontSize="9.5" fill="var(--color-n-400)">
                      {value}
                    </text>
                  </g>
                );
              })
            : null}

          {drawn ? (
            <>
              <path d={drawn.area} fill="url(#entries-per-day-fill)" />
              <path
                d={drawn.line}
                fill="none"
                stroke="var(--color-teal)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {[0, Math.round((days - 1) / 3), Math.round(((days - 1) * 2) / 3), days - 1].map((index) => (
                <text
                  key={index}
                  x={drawn.points[index][0]}
                  y={166}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="var(--color-n-400)"
                >
                  {dayOf(nowS, index, days).getDate()}
                </text>
              ))}
            </>
          ) : null}

          {drawn && hover !== null ? (
            <g aria-hidden>
              <line
                x1={drawn.points[hover][0]}
                y1={drawn.points[hover][1]}
                x2={drawn.points[hover][0]}
                y2={BOX.yBase}
                stroke="var(--color-teal-300)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <circle
                cx={drawn.points[hover][0]}
                cy={drawn.points[hover][1]}
                r="4.5"
                fill="var(--color-paper)"
                stroke="var(--color-teal)"
                strokeWidth="2.5"
              />
              <rect
                x={Math.min(Math.max(drawn.points[hover][0] - 40, BOX.x0), BOX.x1 - 80)}
                y={BOX.yTop}
                width="80"
                height="30"
                rx="6"
                fill="var(--color-ink)"
              />
              <text
                x={Math.min(Math.max(drawn.points[hover][0], BOX.x0 + 40), BOX.x1 - 40)}
                y={BOX.yTop + 13}
                textAnchor="middle"
                fontSize="8.5"
                fill="var(--color-n-400)"
              >
                {SHORT.format(dayOf(nowS, hover, days))}
              </text>
              <text
                x={Math.min(Math.max(drawn.points[hover][0], BOX.x0 + 40), BOX.x1 - 40)}
                y={BOX.yTop + 24}
                textAnchor="middle"
                fontSize="11"
                fontWeight="500"
                fill="var(--color-paper)"
              >
                {values[hover] === 1 ? "1 entry" : `${values[hover]} entries`}
              </text>
            </g>
          ) : null}

          {drawn
            ? values.map((_, index) => (
                <rect
                  key={index}
                  data-testid="day-hit"
                  x={drawn.points[index][0] - step / 2}
                  y={BOX.yTop}
                  width={step}
                  height={BOX.yBase - BOX.yTop}
                  fill="transparent"
                  onMouseEnter={() => setHover(index)}
                />
              ))
            : null}
        </svg>

        {drawn ? null : (
          <p className="absolute inset-0 grid place-items-center text-sm text-n-500">
            No entries in the last {days} days
          </p>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Write `DistanceRings.tsx`**

```tsx
/**
 * One half ring per distance, longest outermost, with the numbers in a key.
 *
 * Ancung chose rings over bars knowing the cost, which the spec records: the
 * shortest arc has the least distance to travel and looks fuller than it is,
 * so the key carries the real numbers. A full distance is the one amber arc,
 * the same amber a sold-out add-on uses.
 *
 * Below `sm` the key goes under the rings rather than beside them.
 */
import type { SterunCategory } from "@sterunxyz/sdk";

import { Badge } from "@/components/ui/badge";

import { halfRingPath } from "../chart";

const LIVE = ["var(--color-teal)", "var(--color-teal-300)", "var(--color-teal-600)", "var(--color-teal-200)"];
const FULL = "var(--color-warning)";

const CX = 150;
const CY = 160;
const OUTER = 132;
const INNER = 46;
const STROKE = 20;

function share(category: SterunCategory): number {
  return category.quota > 0 ? Math.min(1, category.enteredCount / category.quota) : 0;
}

function isFull(category: SterunCategory): boolean {
  return category.quota > 0 && category.enteredCount >= category.quota;
}

export function DistanceRings({ categories }: { categories: readonly SterunCategory[] }) {
  const ordered = [...categories].sort((a, b) => b.distanceM - a.distanceM);
  const gap = ordered.length > 1 ? Math.min(29, (OUTER - INNER) / (ordered.length - 1)) : 0;

  let live = 0;
  const rings = ordered.map((category, index) => ({
    category,
    r: OUTER - index * gap,
    percent: Math.round(share(category) * 100),
    colour: isFull(category) ? FULL : LIVE[live++ % LIVE.length],
  }));

  return (
    <section className="flex flex-col rounded-lg border border-n-200 bg-paper p-4">
      <h2 className="heading-strong mb-3 text-sm text-ink">Distances</h2>

      {rings.length === 0 ? (
        <p className="grid min-h-32 place-items-center text-sm text-n-500">No distances</p>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
          <svg
            viewBox="0 0 300 176"
            role="img"
            aria-label={rings
              .map(({ category, percent }) =>
                isFull(category) ? `${category.code} full` : `${category.code} ${percent} percent`,
              )
              .join(", ")}
            className="h-auto w-full max-w-60 shrink-0"
          >
            <g fill="none" strokeWidth={STROKE} strokeLinecap="round">
              {rings.map(({ category, r, percent, colour }) => (
                <g key={category.categoryId}>
                  <path
                    data-part="track"
                    d={halfRingPath(CX, CY, r)}
                    stroke="var(--color-n-100)"
                    pathLength={100}
                  />
                  {percent > 0 ? (
                    <path
                      data-part="fill"
                      d={halfRingPath(CX, CY, r)}
                      stroke={colour}
                      pathLength={100}
                      strokeDasharray={`${percent} ${100 - percent}`}
                    />
                  ) : null}
                </g>
              ))}
            </g>
          </svg>

          <ul className="flex w-full flex-col gap-2.5 text-sm">
            {rings.map(({ category, colour }) => (
              <li key={category.categoryId} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-sm"
                  /* The one inline style: the colour is picked per ring at runtime. */
                  style={{ background: colour }}
                />
                <span className="flex min-w-0 flex-1 items-center gap-2 font-medium text-ink">
                  {category.code}
                  {isFull(category) ? <Badge variant="warning">Full</Badge> : null}
                </span>
                <span className="numeric whitespace-nowrap text-n-600">
                  {category.enteredCount} / {category.quota}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
```

If `--color-teal-600` or `--color-teal-200` are missing from `fe/app/tokens.css`, substitute tokens
that exist (`grep -n "color-teal" fe/app/tokens.css`). Do not invent a new hex.

- [ ] **Step 6: Run the tests and the typecheck**

Run: `pnpm --filter fe test test/chart.test.ts test/race-charts.test.tsx`
Expected: PASS.
Run: `pnpm --filter fe typecheck && pnpm --filter fe lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add fe/src/modules/organiser/chart.ts fe/src/modules/organiser/component/EntriesPerDay.tsx \
  fe/src/modules/organiser/component/DistanceRings.tsx fe/test
git commit -m "fe: entries per day and the distance rings for a race (STE-17)" -m "Geometry stays in chart.ts where a test can see a NaN; an SVG path containing one does not throw, it just disappears. A distance nobody has entered gets no fill arc at all, because a round cap on a zero-length dash still paints a dot."
```

---

## Task 5: The Overview tab

**Files:**
- Create: `fe/src/modules/organiser/component/ActivityFeed.tsx`
- Create: `fe/src/modules/organiser/component/AddOnsPanel.tsx`
- Create: `fe/src/modules/organiser/component/OverviewTab.tsx`
- Modify: `fe/src/modules/organiser/RaceConsole.tsx`
- Modify: `fe/src/hooks/useRaceRecords.ts` (adds `useRaceRecordsFailed(eventId: number): boolean`)
- Test: `fe/test/OverviewTab.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`raceTotals`, `packsCollected`, `recentActivity`, `formatDuration`, `timeAgo`,
  `IndexedRecord`), Task 4 (`EntriesPerDay`, `DistanceRings`), `useEventAddOns(eventId)` from
  `@/hooks/useEvents`, `useRaceRecords(eventIds)` from `@/hooks/useRaceRecords`, `entriesPerDay`
  from `@/lib/records`, `StatCard`, `formatAmount`.
- Produces: `OverviewTab({ summary }: { summary: EventSummary })`,
  `ActivityFeed({ items, nowS, failed })`, `AddOnsPanel({ addOns, failed })`.

`useRaceRecords` returns a `Map` holding only races whose read answered. An absent key is "not
answered", never "no entries"; this tab keeps that distinction on screen.

- [ ] **Step 1: Write the failing test**

`fe/test/OverviewTab.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import type { EventSummary } from "@/lib/events";
import { OverviewTab } from "@/modules/organiser/component/OverviewTab";
import type { SterunAddOn } from "@sterunxyz/sdk";

const readClient = vi.hoisted(() => ({ listAddOns: vi.fn() }));
vi.mock("@/lib/sterun", () => ({ readClient }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const RUNNER = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";

const SUMMARY: EventSummary = {
  event: {
    eventId: 4,
    organiser: "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN",
    name: "Fun Run Sleman",
    metadataHash: "a".repeat(64),
    uri: "",
    startsAt: 4_000_000_000n,
    status: "Open",
  },
  categories: [
    {
      eventId: 4,
      categoryId: 0,
      code: "10K",
      distanceM: 10_000,
      quota: 200,
      enteredCount: 2,
      priceStroops: 100_000_000n,
      slotsLeft: 198,
    },
  ],
};

const JERSEY: SterunAddOn = {
  eventId: 4,
  addonId: 0,
  code: "JERSEY_M",
  priceStroops: 50_000_000n,
  quota: 3,
  reservedCount: 3,
  unitsLeft: 0,
};

function row(overrides: Record<string, unknown>) {
  return {
    token_id: 1,
    event_id: 4,
    category_id: 0,
    bib_no: 7,
    runner_address: RUNNER,
    state: "Entered",
    entered_at: "1700000000",
    claimed_at: null,
    finish_time_s: null,
    result_at: null,
    ...overrides,
  };
}

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<OverviewTab summary={SUMMARY} />, { wrapper: Wrapper });
}

beforeEach(() => {
  readClient.listAddOns.mockReset();
  readClient.listAddOns.mockResolvedValue([JERSEY]);
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({
    records: [
      row({ token_id: 1, bib_no: 7, state: "RacepackClaimed", claimed_at: "1700000500" }),
      row({ token_id: 2, bib_no: 8, entered_at: "1700000100" }),
    ],
    count: 2,
  });
});

describe("OverviewTab", () => {
  describe("positive", () => {
    it("fills the three cards from the chain and the index", async () => {
      renderTab();

      expect(screen.getByText("Entries").parentElement).toHaveTextContent(/2\s*of 200/);
      // 2 x 10 sUSD in fees plus 3 x 5 sUSD in jerseys.
      expect(await screen.findByText(/^35/)).toBeInTheDocument();
      expect(await screen.findByText("Race packs collected")).toBeInTheDocument();
      expect(screen.getByText("Race packs collected").parentElement).toHaveTextContent(/1\s*of 2/);
    });

    it("lists what happened, newest first", async () => {
      renderTab();

      const items = await screen.findAllByRole("listitem", { name: /^Bib/ });
      expect(items[0]).toHaveTextContent("Bib 7 collected their race pack");
      expect(items[1]).toHaveTextContent("Bib 8 entered the 10K");
    });

    it("marks a sold-out add-on", async () => {
      renderTab();
      expect(await screen.findByText("Sold out")).toBeInTheDocument();
      expect(screen.getByText("3 / 3")).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("says the index did not answer instead of reporting zero", async () => {
      vi.mocked(apiFetch).mockRejectedValue(new Error("down"));
      renderTab();

      expect(await screen.findByText("Activity could not be loaded")).toBeInTheDocument();
      expect(screen.getByText("Race packs collected").parentElement).toHaveTextContent("Not loaded");
    });
  });

  describe("edge", () => {
    it("writes an untimed finish as no official time, never as zero", async () => {
      vi.mocked(apiFetch).mockResolvedValue({
        records: [
          row({ state: "Finished", claimed_at: "1700000500", finish_time_s: null, result_at: "1700009000" }),
        ],
        count: 1,
      });
      renderTab();

      expect(await screen.findByText(/finished the 10K with no official time/)).toBeInTheDocument();
      expect(screen.queryByText(/0:00/)).not.toBeInTheDocument();
    });

    it("says a race sells no add-ons when it sells none", async () => {
      readClient.listAddOns.mockResolvedValue([]);
      renderTab();
      expect(await screen.findByText("No add-ons")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter fe test test/OverviewTab.test.tsx`
Expected: FAIL, `OverviewTab` does not exist.

- [ ] **Step 3: Write `ActivityFeed.tsx`**

```tsx
/**
 * The last few things that happened to this race's runners.
 *
 * Every icon is the same teal; the glyph carries the meaning. That leaves
 * amber free for a row that ever genuinely needs attention.
 */
import { CircleSlashIcon, FlagIcon, PackageCheckIcon, PlusIcon } from "lucide-react";

import { formatDuration, timeAgo, type ActivityItem } from "../race";

const ICONS = {
  entered: PlusIcon,
  collected: PackageCheckIcon,
  finished: FlagIcon,
  dnf: CircleSlashIcon,
} as const;

function sentence(item: ActivityItem): string {
  switch (item.kind) {
    case "entered":
      return `entered the ${item.code}`;
    case "collected":
      return "collected their race pack";
    case "finished":
      return item.finishTimeS === null
        ? `finished the ${item.code} with no official time`
        : `finished the ${item.code} in ${formatDuration(item.finishTimeS)}`;
    case "dnf":
      return `did not finish the ${item.code}`;
  }
}

export function ActivityFeed({
  items,
  nowS,
  loading,
  failed,
}: {
  items: readonly ActivityItem[];
  nowS: bigint | undefined;
  /** Not answered yet. Kept apart from an empty list, which is a finding. */
  loading: boolean;
  failed: boolean;
}) {
  return (
    <section className="flex flex-col rounded-lg border border-n-200 bg-paper p-4">
      <h2 className="heading-strong mb-3 text-sm text-ink">Activity</h2>
      {loading ? (
        <div role="status" aria-label="Loading activity" className="h-32 animate-pulse rounded-md bg-n-100" />
      ) : failed ? (
        <p className="grid min-h-32 place-items-center text-sm text-n-500">Activity could not be loaded</p>
      ) : items.length === 0 ? (
        <p className="grid min-h-32 place-items-center text-sm text-n-500">Nothing has happened yet</p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => {
            const Icon = ICONS[item.kind];
            const text = `Bib ${item.bibNo} ${sentence(item)}`;
            return (
              <li
                key={`${item.kind}-${item.tokenId}`}
                aria-label={text}
                className="flex items-center gap-3 border-b border-n-100 py-2.5 last:border-b-0"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-teal-50 text-teal">
                  <Icon aria-hidden className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 text-sm text-n-600">
                  <b className="font-medium text-ink">Bib {item.bibNo}</b> {sentence(item)}
                </span>
                {nowS === undefined ? null : (
                  <span className="shrink-0 text-xs whitespace-nowrap text-n-500">{timeAgo(item.at, nowS)}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Write `AddOnsPanel.tsx`**

```tsx
/**
 * One bar per add-on: reserved against quota.
 *
 * Generic on purpose. `AddOnData` knows a code, a quota and a count and
 * nothing about jerseys, so a tumbler and a medal are the same row, and the
 * code shows as the organiser typed it in the wizard.
 */
import type { SterunAddOn } from "@sterunxyz/sdk";

import { Badge } from "@/components/ui/badge";

export function AddOnsPanel({
  addOns,
  failed,
}: {
  addOns: readonly SterunAddOn[] | undefined;
  failed: boolean;
}) {
  return (
    <section className="flex flex-col rounded-lg border border-n-200 bg-paper p-4">
      <h2 className="heading-strong mb-3 text-sm text-ink">Add-ons</h2>
      {failed ? (
        <p className="grid min-h-32 place-items-center text-sm text-n-500">Add-ons could not be loaded</p>
      ) : addOns === undefined ? (
        <div role="status" aria-label="Loading add-ons" className="h-32 animate-pulse rounded-md bg-n-100" />
      ) : addOns.length === 0 ? (
        <p className="grid min-h-32 place-items-center text-sm text-n-500">No add-ons</p>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {addOns.map((addOn) => {
            const soldOut = addOn.quota > 0 && addOn.reservedCount >= addOn.quota;
            const width = addOn.quota > 0 ? `${Math.min(100, (addOn.reservedCount / addOn.quota) * 100)}%` : "0%";
            return (
              <li key={addOn.addonId}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 font-medium text-ink">
                    <span className="truncate">{addOn.code}</span>
                    {soldOut ? <Badge variant="warning">Sold out</Badge> : null}
                  </span>
                  <span className="numeric whitespace-nowrap text-n-600">
                    {addOn.reservedCount} / {addOn.quota}
                  </span>
                </div>
                <div aria-hidden className="h-2 overflow-hidden rounded-full bg-n-100">
                  <div
                    className={soldOut ? "h-full rounded-full bg-warning" : "h-full rounded-full bg-teal"}
                    style={{ width }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Write `OverviewTab.tsx`**

```tsx
"use client";

/**
 * A race at a glance: how full, how much taken, how many packs out, and what
 * is moving.
 *
 * Money and places come from the chain; the race's activity comes from the
 * index. When the index does not answer, the cards that depend on it say "Not
 * loaded" rather than 0, because zero race packs collected on race morning is
 * a finding and a timeout is not.
 */
import { useEventAddOns } from "@/hooks/useEvents";
import { useNowSeconds } from "@/hooks/useNowSeconds";
import { useRaceRecords, useRaceRecordsFailed } from "@/hooks/useRaceRecords";
import type { EventSummary } from "@/lib/events";
import { entriesPerDay } from "@/lib/records";
import { formatAmount } from "@/utils/format";

import { packsCollected, raceTotals, recentActivity } from "../race";
import { ActivityFeed } from "./ActivityFeed";
import { AddOnsPanel } from "./AddOnsPanel";
import { DistanceRings } from "./DistanceRings";
import { EntriesPerDay } from "./EntriesPerDay";
import { StatCard } from "./StatCard";

const DAYS = 14;
const ACTIVITY_ROWS = 5;

function share(part: number, whole: number): number | undefined {
  return whole > 0 ? part / whole : undefined;
}

export function OverviewTab({ summary }: { summary: EventSummary }) {
  const { eventId } = summary.event;
  const nowS = useNowSeconds();
  const addOns = useEventAddOns(eventId);
  const records = useRaceRecords([eventId]).get(eventId);
  const recordsFailed = useRaceRecordsFailed(eventId);
  const recordsLoading = records === undefined && !recordsFailed;

  const totals = raceTotals(summary.categories, addOns.data ?? []);
  const collected = records === undefined ? null : packsCollected(records);
  const collectedValue =
    collected !== null ? collected.toLocaleString("en-US") : recordsFailed ? "Not loaded" : "...";

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Entries"
          value={totals.entered.toLocaleString("en-US")}
          unit={`of ${totals.quota.toLocaleString("en-US")}`}
          filled={share(totals.entered, totals.quota)}
        />
        <StatCard
          label="Payments received"
          value={formatAmount(totals.received)}
          unit={`of ${formatAmount(totals.potential)} sUSD`}
          filled={share(Number(totals.received), Number(totals.potential))}
        />
        <StatCard
          label="Race packs collected"
          value={collectedValue}
          unit={collected === null ? undefined : `of ${totals.entered.toLocaleString("en-US")}`}
          filled={collected === null ? undefined : share(collected, totals.entered)}
          tone="success"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        {nowS === undefined ? (
          <div className="h-60 animate-pulse rounded-lg bg-n-100" />
        ) : (
          <EntriesPerDay values={entriesPerDay(records ?? [], nowS, DAYS)} nowS={nowS} />
        )}
        <DistanceRings categories={summary.categories} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <ActivityFeed
          items={recentActivity(records ?? [], summary.categories, ACTIVITY_ROWS)}
          nowS={nowS}
          loading={recordsLoading}
          failed={recordsFailed}
        />
        <AddOnsPanel addOns={addOns.data} failed={addOns.isError} />
      </div>
    </>
  );
}
```

- [ ] **Step 5b: Tell "not answered yet" from "failed"**

`useRaceRecords` leaves a race out of its map both while the read is in flight and after it fails,
so `OverviewTab` cannot tell a timeout from a slow node with it alone. Add to
`fe/src/hooks/useRaceRecords.ts`:

```ts
/**
 * Whether one race's read has failed, as opposed to not having answered yet.
 * Reads the same cache entry `useRaceRecords` fills, so it costs no request.
 */
export function useRaceRecordsFailed(eventId: number): boolean {
  const client = useQueryClient();
  return useSyncExternalStore(
    (onChange) => client.getQueryCache().subscribe(onChange),
    () => client.getQueryState(["race-records", eventId])?.status === "error",
    () => false,
  );
}
```

with `import { useQueries, useQueryClient } from "@tanstack/react-query";` and
`import { useSyncExternalStore } from "react";`. Add this test to the `edge` block of
`fe/test/OverviewTab.test.tsx`:

```tsx
    it("does not claim a failure while the index is still answering", () => {
      vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
      renderTab();
      expect(screen.queryByText("Activity could not be loaded")).not.toBeInTheDocument();
    });
```

- [ ] **Step 6: Show it on the Overview tab**

In `fe/src/modules/organiser/RaceConsole.tsx` add `import { OverviewTab } from "./component/OverviewTab";`
and replace `{/* tab bodies */}` with:

```tsx
        {tab === "overview" ? <OverviewTab summary={data} /> : null}
        {/* tab bodies */}
```

- [ ] **Step 7: Run the tests and the typecheck**

Run: `pnpm --filter fe test test/OverviewTab.test.tsx test/RaceConsole.test.tsx test/OrganiserHome.test.tsx`
Expected: PASS.
Run: `pnpm --filter fe typecheck && pnpm --filter fe lint`
Expected: clean. If the React Compiler lint objects to `useSyncExternalStore`'s inline subscribe
function, hoist it with `useCallback` keyed on `client`.

- [ ] **Step 8: Commit**

```bash
git add fe/src/modules/organiser fe/src/hooks/useRaceRecords.ts fe/test
git commit -m "fe: the race Overview tab (STE-17)" -m "Figures that depend on the index say they were not loaded rather than reading zero: zero race packs collected on race morning is a finding, a timeout is not, and the two must not look alike."
```

---

## Task 6: The Entries tab

**Files:**
- Create: `fe/src/modules/organiser/component/EntriesTab.tsx`
- Modify: `fe/src/modules/organiser/RaceConsole.tsx`
- Test: `fe/test/EntriesTab.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`filterEntries`, `entryStatus`, `packsCollected`, `addOnsToHandOut`,
  `type StatusFilter`, `type EntryStatus`), Task 5 (`useRaceRecordsFailed`), `useRaceRecords`,
  `useEventAddOns`, `StatCard`, `Input` from `@/components/ui/input`, `Badge`, `shortAddress`,
  `formatEventDate`.
- Produces: `EntriesTab({ summary }: { summary: EventSummary })`.

The **Add-ons** column and the **Add-ons to hand out** card depend on ticket A. Until every record
carries `addonIds`, the column is not drawn and the third card reads **Add-ons sold** from the chain
instead. Neither shows a guess.

- [ ] **Step 1: Write the failing test**

`fe/test/EntriesTab.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import type { EventSummary } from "@/lib/events";
import { EntriesTab } from "@/modules/organiser/component/EntriesTab";
import type { SterunAddOn } from "@sterunxyz/sdk";

const readClient = vi.hoisted(() => ({ listAddOns: vi.fn() }));
vi.mock("@/lib/sterun", () => ({ readClient }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const WALLET_A = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";
const WALLET_B = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";

const SUMMARY: EventSummary = {
  event: {
    eventId: 4,
    organiser: WALLET_A,
    name: "Fun Run Sleman",
    metadataHash: "a".repeat(64),
    uri: "",
    startsAt: 4_000_000_000n,
    status: "Open",
  },
  categories: [
    { eventId: 4, categoryId: 0, code: "5K", distanceM: 5_000, quota: 100, enteredCount: 1, priceStroops: 0n, slotsLeft: 99 },
    { eventId: 4, categoryId: 1, code: "10K", distanceM: 10_000, quota: 100, enteredCount: 1, priceStroops: 0n, slotsLeft: 99 },
  ],
};

const JERSEY: SterunAddOn = {
  eventId: 4, addonId: 0, code: "JERSEY_L", priceStroops: 0n, quota: 50, reservedCount: 1, unitsLeft: 49,
};

function row(overrides: Record<string, unknown>) {
  return {
    token_id: 1,
    event_id: 4,
    category_id: 0,
    bib_no: 1,
    runner_address: WALLET_A,
    state: "Entered",
    entered_at: "1700000000",
    claimed_at: null,
    finish_time_s: null,
    result_at: null,
    ...overrides,
  };
}

const ROWS = [
  row({ token_id: 1, bib_no: 12, category_id: 0, runner_address: WALLET_A }),
  row({ token_id: 2, bib_no: 7, category_id: 1, runner_address: WALLET_B, state: "RacepackClaimed", claimed_at: "1700000500", entered_at: "1700000100" }),
];

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<EntriesTab summary={SUMMARY} />, { wrapper: Wrapper });
}

async function bodyRows() {
  const table = await screen.findByRole("table");
  return within(table).getAllByRole("row").slice(1);
}

beforeEach(() => {
  readClient.listAddOns.mockReset();
  readClient.listAddOns.mockResolvedValue([JERSEY]);
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({ records: ROWS, count: ROWS.length });
});

describe("EntriesTab", () => {
  describe("positive", () => {
    it("lists every entry with the columns from the design", async () => {
      renderTab();

      const table = await screen.findByRole("table");
      const heads = within(table).getAllByRole("columnheader").map((th) => th.textContent);
      expect(heads).toEqual(["Wallet", "Bib", "Distance", "Entered", "Status"]);
      expect(await bodyRows()).toHaveLength(2);
      expect(screen.getByText("2 entries")).toBeInTheDocument();
    });

    it("finds a runner by bib and narrows by status", async () => {
      renderTab();
      await screen.findByRole("table");

      await userEvent.type(screen.getByRole("searchbox", { name: "Search a bib number or a wallet" }), "12");
      expect(await bodyRows()).toHaveLength(1);
      expect(screen.getByText("1 entry")).toBeInTheDocument();

      await userEvent.clear(screen.getByRole("searchbox"));
      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Status" }), "collected");
      const rows = await bodyRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveTextContent("Pack collected");
    });

    it("draws the Add-ons column once the index sends what each runner bought", async () => {
      vi.mocked(apiFetch).mockResolvedValue({
        records: [row({ addon_ids: [0] }), row({ token_id: 2, bib_no: 2, addon_ids: [] })],
        count: 2,
      });
      renderTab();

      const table = await screen.findByRole("table");
      expect(within(table).getByRole("columnheader", { name: "Add-ons" })).toBeInTheDocument();
      expect(within(table).getByText("JERSEY_L")).toBeInTheDocument();
      expect(within(table).getByText("None")).toBeInTheDocument();
      expect(screen.getByText("Add-ons to hand out")).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("never offers to search by name", async () => {
      renderTab();
      await screen.findByRole("table");
      expect(screen.queryByPlaceholderText(/name/i)).not.toBeInTheDocument();
    });

    it("draws no Add-ons column and no guessed count before the index sends add-ons", async () => {
      renderTab();
      const table = await screen.findByRole("table");
      expect(within(table).queryByRole("columnheader", { name: "Add-ons" })).not.toBeInTheDocument();
      expect(screen.queryByText("Add-ons to hand out")).not.toBeInTheDocument();
      expect(screen.getByText("Add-ons sold")).toBeInTheDocument();
    });

    it("says the entries could not be loaded rather than showing an empty race", async () => {
      vi.mocked(apiFetch).mockRejectedValue(new Error("down"));
      renderTab();
      expect(await screen.findByRole("alert")).toHaveTextContent("We could not load the entries");
      expect(screen.queryByText("Nobody has entered yet")).not.toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("tells an empty race from a search that matched nothing", async () => {
      renderTab();
      await screen.findByRole("table");
      await userEvent.type(screen.getByRole("searchbox"), "999");
      expect(await screen.findByText("No entries match")).toBeInTheDocument();
    });

    it("says nobody has entered a race with no entries", async () => {
      vi.mocked(apiFetch).mockResolvedValue({ records: [], count: 0 });
      renderTab();
      expect(await screen.findByText("Nobody has entered yet")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter fe test test/EntriesTab.test.tsx`
Expected: FAIL, `EntriesTab` does not exist.

- [ ] **Step 3: Write `EntriesTab.tsx`**

```tsx
"use client";

/**
 * Every entry in the race, searchable by bib or wallet.
 *
 * Never by name. Runner names are encrypted in the vault and this page never
 * holds them; the placeholder says what can be searched so nobody types a name
 * into a box that quietly finds nothing.
 *
 * The toolbar sits outside the card and the card holds only the table
 * (spec, "Decisions taken"). Filters are plain selects with no active colour.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ErrorNotice } from "@/components/elements/ErrorNotice";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useEventAddOns } from "@/hooks/useEvents";
import { useRaceRecords, useRaceRecordsFailed } from "@/hooks/useRaceRecords";
import type { EventSummary } from "@/lib/events";
import type { IndexedRecord } from "@/lib/records";
import { formatEventDate, shortAddress } from "@/utils/format";

import {
  addOnsToHandOut,
  entryStatus,
  filterEntries,
  packsCollected,
  type EntryStatus,
  type StatusFilter,
} from "../race";
import { StatCard } from "./StatCard";

const STATUS: Record<EntryStatus, { label: string; variant: "success" | "warning" | "muted" }> = {
  "not-collected": { label: "Not collected", variant: "warning" },
  collected: { label: "Pack collected", variant: "success" },
  finished: { label: "Finished", variant: "success" },
  dnf: { label: "Did not finish", variant: "muted" },
};

const SELECT =
  "h-9 rounded-md border border-n-200 bg-paper px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-ring";
const HEAD = "bg-n-100 px-4 py-2.5 text-left font-medium whitespace-nowrap text-n-600";
const CELL = "border-b border-n-200 px-4 py-3 align-middle whitespace-nowrap";

function share(part: number, whole: number): number | undefined {
  return whole > 0 ? part / whole : undefined;
}

export function EntriesTab({ summary }: { summary: EventSummary }) {
  const { eventId } = summary.event;
  const queryClient = useQueryClient();
  const addOns = useEventAddOns(eventId);
  const records = useRaceRecords([eventId]).get(eventId);
  const failed = useRaceRecordsFailed(eventId);

  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");

  const quota = summary.categories.reduce((sum, category) => sum + category.quota, 0);
  const codes = new Map(summary.categories.map((category) => [category.categoryId, category.code]));
  const addOnCodes = new Map((addOns.data ?? []).map((addOn) => [addOn.addonId, addOn.code]));

  if (failed) {
    return (
      <ErrorNotice
        title="We could not load the entries"
        detail="This is a connection problem, not an empty race. Please try again."
        onRetry={() => void queryClient.invalidateQueries({ queryKey: ["race-records", eventId] })}
      />
    );
  }

  if (records === undefined) {
    return <div role="status" aria-label="Loading entries" className="h-80 animate-pulse rounded-lg bg-n-100" />;
  }

  const collected = packsCollected(records);
  const owed = addOnsToHandOut(records);
  const showAddOns = owed !== null && records.length > 0;
  const sold = (addOns.data ?? []).reduce((sum, addOn) => sum + addOn.reservedCount, 0);
  const stock = (addOns.data ?? []).reduce((sum, addOn) => sum + addOn.quota, 0);
  const shown = filterEntries(records, { query, categoryId, status });

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Entries"
          value={records.length.toLocaleString("en-US")}
          unit={`of ${quota.toLocaleString("en-US")}`}
          filled={share(records.length, quota)}
        />
        <StatCard
          label="Race packs still to hand out"
          value={(records.length - collected).toLocaleString("en-US")}
          filled={share(collected, records.length)}
          tone="success"
        />
        {showAddOns ? (
          <StatCard label="Add-ons to hand out" value={owed.toLocaleString("en-US")} />
        ) : (
          <StatCard
            label="Add-ons sold"
            value={sold.toLocaleString("en-US")}
            unit={stock > 0 ? `of ${stock.toLocaleString("en-US")}` : undefined}
            filled={share(sold, stock)}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a bib number or a wallet"
          aria-label="Search a bib number or a wallet"
          className="w-full sm:w-72"
        />
        <select
          aria-label="Distance"
          className={SELECT}
          value={categoryId ?? ""}
          onChange={(e) => setCategoryId(e.target.value === "" ? null : Number(e.target.value))}
        >
          <option value="">All distances</option>
          {summary.categories.map((category) => (
            <option key={category.categoryId} value={category.categoryId}>
              {category.code}
            </option>
          ))}
        </select>
        <select
          aria-label="Status"
          className={SELECT}
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          <option value="all">All statuses</option>
          {(Object.keys(STATUS) as EntryStatus[]).map((key) => (
            <option key={key} value={key}>
              {STATUS[key].label}
            </option>
          ))}
        </select>
        <span className="ml-auto text-sm text-n-500">
          {shown.length === 1 ? "1 entry" : `${shown.length.toLocaleString("en-US")} entries`}
        </span>
      </div>

      <section className="overflow-hidden rounded-lg border border-n-200 bg-paper">
        {records.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-n-500">Nobody has entered yet</p>
        ) : shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-n-500">No entries match</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th scope="col" className={HEAD}>Wallet</th>
                  <th scope="col" className={HEAD}>Bib</th>
                  <th scope="col" className={HEAD}>Distance</th>
                  <th scope="col" className={HEAD}>Entered</th>
                  <th scope="col" className={HEAD}>Status</th>
                  {showAddOns ? <th scope="col" className={HEAD}>Add-ons</th> : null}
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {shown.map((record) => (
                  <EntryRow
                    key={record.tokenId}
                    record={record}
                    code={codes.get(record.categoryId) ?? `Distance ${record.categoryId}`}
                    addOns={
                      showAddOns
                        ? (record.addonIds ?? []).map((id) => addOnCodes.get(id) ?? `Add-on ${id}`)
                        : null
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function EntryRow({
  record,
  code,
  addOns,
}: {
  record: IndexedRecord;
  code: string;
  addOns: string[] | null;
}) {
  const status = STATUS[entryStatus(record)];
  return (
    <tr>
      <td className={`numeric text-ink ${CELL}`} title={record.runnerAddress}>
        {shortAddress(record.runnerAddress, 8, 7)}
      </td>
      <td className={`numeric ${CELL}`}>{record.bibNo}</td>
      <td className={`text-ink ${CELL}`}>{code}</td>
      <td className={`text-n-600 ${CELL}`}>{formatEventDate(record.enteredAt)}</td>
      <td className={CELL}>
        <Badge variant={status.variant}>{status.label}</Badge>
      </td>
      {addOns === null ? null : (
        <td className={`text-ink ${CELL}`}>{addOns.length === 0 ? "None" : addOns.join(", ")}</td>
      )}
    </tr>
  );
}
```

`owed.toLocaleString` compiles because `showAddOns` implies `owed !== null`, but TypeScript does not
narrow through a separate boolean. If typecheck complains, write `(owed ?? 0).toLocaleString("en-US")`.

- [ ] **Step 4: Show it on the Entries tab**

In `RaceConsole.tsx` add `import { EntriesTab } from "./component/EntriesTab";` and replace
`{/* tab bodies */}` with:

```tsx
        {tab === "entries" ? <EntriesTab summary={data} /> : null}
        {/* tab bodies */}
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `pnpm --filter fe test test/EntriesTab.test.tsx test/RaceConsole.test.tsx test/ui-rules.test.ts`
Expected: PASS.
Run: `pnpm --filter fe typecheck && pnpm --filter fe lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add fe/src/modules/organiser fe/test/EntriesTab.test.tsx
git commit -m "fe: the race Entries tab (STE-17)" -m "Search is by bib or wallet and says so, because names live encrypted in the vault. The Add-ons column is drawn only once the index sends each runner's add-ons; until then the card falls back to what the chain can say, add-ons sold."
```

---

## Task 7: The Scanners tab

**Files:**
- Create: `fe/src/modules/organiser/component/ScannersTab.tsx`
- Modify: `fe/src/modules/organiser/RaceConsole.tsx`
- Test: `fe/test/ScannersTab.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`useRaceScanners`, `IndexedScanner`), `useAddScanner()` / `useRemoveScanner()`
  from `@/hooks/useOrganiser` (`write({ eventId, scanner })`, `phase`, `isBusy`, `error`, `reset`),
  `useWallet`, `StrKey` from `@stellar/stellar-sdk`, `friendlyError`, `formatEventDate`, the dialog
  primitives from `@/components/ui/dialog`.
- Produces: `ScannersTab({ summary }: { summary: EventSummary })`.

Two facts shape this tab:

- **The list comes from the index and lags the chain by a poll.** A scanner the organiser has just
  signed for would not be in the next read. So the tab keeps what it signed for locally, shows it as
  "Just added", and lets the index catch up. The same for a removal.
- **Added at** and **Scanned** depend on ticket B. Each column is drawn once any row carries its
  field.

- [ ] **Step 1: Write the failing test**

`fe/test/ScannersTab.test.tsx`:

```tsx
import { Keypair } from "@stellar/stellar-sdk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWallet } from "@/hooks/useWallet";
import { apiFetch } from "@/lib/api";
import type { EventSummary } from "@/lib/events";
import { ScannersTab } from "@/modules/organiser/component/ScannersTab";

const readClient = vi.hoisted(() => ({ addScanner: vi.fn(), removeScanner: vi.fn() }));
vi.mock("@/lib/sterun", () => ({ readClient }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));
vi.mock("@/lib/wallet", () => ({
  initWallet: vi.fn(),
  restoreAddress: vi.fn(async () => null),
  onWalletStateChange: vi.fn(() => () => {}),
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  signTransaction: vi.fn(),
  signMessage: vi.fn(),
  walletErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

// Real keys, so the address check in the dialog is exercised for real.
const ORGANISER = Keypair.random().publicKey();
const GATE_PHONE = Keypair.random().publicKey();
const NEW_PHONE = Keypair.random().publicKey();

const SUMMARY: EventSummary = {
  event: {
    eventId: 4,
    organiser: ORGANISER,
    name: "Fun Run Sleman",
    metadataHash: "a".repeat(64),
    uri: "",
    startsAt: 4_000_000_000n,
    status: "Open",
  },
  categories: [],
};

const SENT = { value: undefined, txHash: "ab", ledger: 1 };

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<ScannersTab summary={SUMMARY} />, { wrapper: Wrapper });
}

beforeEach(() => {
  readClient.addScanner.mockReset();
  readClient.removeScanner.mockReset();
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({
    scanners: [{ address: GATE_PHONE, added_ledger: 100 }],
    last_ledger: 120,
  });
  useWallet.setState({ address: ORGANISER, isRestoring: false, isConnecting: false, error: null });
});

async function openAdd() {
  await userEvent.click(await screen.findByRole("button", { name: "Add scanner" }));
  return screen.findByRole("dialog");
}

describe("ScannersTab", () => {
  describe("positive", () => {
    it("lists each scanner by its whole address, with a way to remove it", async () => {
      renderTab();

      const table = await screen.findByRole("table");
      expect(within(table).getByText(GATE_PHONE)).toBeInTheDocument();
      expect(within(table).getByRole("button", { name: `Remove ${GATE_PHONE}` })).toBeInTheDocument();
      expect(screen.getByText("1 scanner")).toBeInTheDocument();
    });

    it("adds a scanner after a signature and shows it before the list catches up", async () => {
      readClient.addScanner.mockResolvedValue(SENT);
      renderTab();

      const dialog = await openAdd();
      expect(dialog).toHaveTextContent("the phone that will do the scanning");
      await userEvent.type(within(dialog).getByRole("textbox", { name: "Wallet address" }), NEW_PHONE);
      await userEvent.click(within(dialog).getByRole("button", { name: "Sign and add" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(readClient.addScanner).toHaveBeenCalledWith(4, NEW_PHONE, expect.objectContaining({ publicKey: ORGANISER }));
      // The index still answers with the old list; the new phone shows anyway.
      const row = within(screen.getByRole("table")).getByText(NEW_PHONE).closest("tr")!;
      expect(row).toHaveTextContent("Just added");
    });

    it("removes a scanner after a signature", async () => {
      readClient.removeScanner.mockResolvedValue(SENT);
      renderTab();

      await userEvent.click(await screen.findByRole("button", { name: `Remove ${GATE_PHONE}` }));
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent("will no longer be able to check runners in");
      await userEvent.click(within(dialog).getByRole("button", { name: "Sign and remove" }));

      await waitFor(() => expect(screen.queryByText(GATE_PHONE)).not.toBeInTheDocument());
      expect(readClient.removeScanner).toHaveBeenCalledWith(4, GATE_PHONE, expect.anything());
    });

    it("draws Added at and Scanned once the index sends them", async () => {
      vi.mocked(apiFetch).mockResolvedValue({
        scanners: [{ address: GATE_PHONE, added_ledger: 100, added_at: "1788000000", scans: 118 }],
        last_ledger: 120,
      });
      renderTab();

      const table = await screen.findByRole("table");
      expect(within(table).getByRole("columnheader", { name: "Added at" })).toBeInTheDocument();
      expect(within(table).getByRole("columnheader", { name: "Scanned" })).toBeInTheDocument();
      expect(within(table).getByText("118")).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("refuses something that is not a wallet address, before any signature", async () => {
      renderTab();
      const dialog = await openAdd();
      await userEvent.type(within(dialog).getByRole("textbox", { name: "Wallet address" }), "GABC");
      await userEvent.click(within(dialog).getByRole("button", { name: "Sign and add" }));

      expect(within(dialog).getByRole("alert")).toHaveTextContent("starts with G and is 56 characters long");
      expect(readClient.addScanner).not.toHaveBeenCalled();
    });

    it("refuses the organiser's own wallet, the mistake found on race morning", async () => {
      renderTab();
      const dialog = await openAdd();
      await userEvent.type(within(dialog).getByRole("textbox", { name: "Wallet address" }), ORGANISER);
      await userEvent.click(within(dialog).getByRole("button", { name: "Sign and add" }));

      expect(within(dialog).getByRole("alert")).toHaveTextContent("This is your own wallet");
      expect(readClient.addScanner).not.toHaveBeenCalled();
    });

    it("refuses a wallet that is already a scanner", async () => {
      renderTab();
      await screen.findByRole("table");
      const dialog = await openAdd();
      await userEvent.type(within(dialog).getByRole("textbox", { name: "Wallet address" }), GATE_PHONE);
      await userEvent.click(within(dialog).getByRole("button", { name: "Sign and add" }));

      expect(within(dialog).getByRole("alert")).toHaveTextContent("can already check runners in");
      expect(readClient.addScanner).not.toHaveBeenCalled();
    });

    it("keeps the dialog open and explains when signing fails", async () => {
      readClient.addScanner.mockRejectedValue(new Error("boom"));
      renderTab();
      const dialog = await openAdd();
      await userEvent.type(within(dialog).getByRole("textbox", { name: "Wallet address" }), NEW_PHONE);
      await userEvent.click(within(dialog).getByRole("button", { name: "Sign and add" }));

      expect(await within(dialog).findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("says the list could not be loaded rather than that there are no scanners", async () => {
      vi.mocked(apiFetch).mockRejectedValue(new Error("down"));
      renderTab();
      expect(await screen.findByRole("alert")).toHaveTextContent("We could not load the scanners");
      expect(screen.queryByText("No scanner yet")).not.toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("says what an empty list means on race day", async () => {
      vi.mocked(apiFetch).mockResolvedValue({ scanners: [], last_ledger: 120 });
      renderTab();
      expect(await screen.findByText("No scanner yet")).toBeInTheDocument();
      expect(screen.getByText("Nobody can check runners in on race day.")).toBeInTheDocument();
    });

    it("accepts an address pasted with spaces around it", async () => {
      readClient.addScanner.mockResolvedValue(SENT);
      renderTab();
      const dialog = await openAdd();
      await userEvent.type(within(dialog).getByRole("textbox", { name: "Wallet address" }), `  ${NEW_PHONE} `);
      await userEvent.click(within(dialog).getByRole("button", { name: "Sign and add" }));
      await waitFor(() => expect(readClient.addScanner).toHaveBeenCalledWith(4, NEW_PHONE, expect.anything()));
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter fe test test/ScannersTab.test.tsx`
Expected: FAIL, `ScannersTab` does not exist.

- [ ] **Step 3: Write `ScannersTab.tsx`**

```tsx
"use client";

/**
 * The devices allowed to check runners in, and the only place one is added.
 *
 * Shaped like Entries and smaller: search and the one button above the card,
 * the table in it, no stat cards (three numbers about three rows would be
 * furniture).
 *
 * The list is the index's, which lags a signature by a poll, so what this tab
 * signed for is kept locally until the index agrees. Without that, a scanner
 * somebody just paid a signature for would vanish from the list they are
 * looking at, and the obvious reaction is to add it again.
 */
import { StrKey } from "@stellar/stellar-sdk";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ErrorNotice } from "@/components/elements/ErrorNotice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAddScanner, useRemoveScanner } from "@/hooks/useOrganiser";
import { useRaceScanners } from "@/hooks/useRaceScanners";
import type { EventSummary } from "@/lib/events";
import { friendlyError } from "@/lib/errors";
import type { IndexedScanner } from "@/lib/scanners";
import { formatEventDate } from "@/utils/format";

const HEAD = "bg-n-100 px-4 py-2.5 text-left font-medium whitespace-nowrap text-n-600";
const CELL = "border-b border-n-200 px-4 py-3 align-middle";

interface Row extends IndexedScanner {
  justAdded: boolean;
}

/** Why an address cannot be added, or `null` when it can. Checked before any signature. */
function refusal(address: string, organiser: string, listed: readonly string[]): string | null {
  if (address === organiser) {
    return "This is your own wallet. Paste the address of the phone that will scan.";
  }
  if (listed.includes(address)) return "This wallet can already check runners in for this race.";
  if (!StrKey.isValidEd25519PublicKey(address)) {
    return "Paste a wallet address. It starts with G and is 56 characters long.";
  }
  return null;
}

export function ScannersTab({ summary }: { summary: EventSummary }) {
  const { eventId, organiser } = summary.event;
  const queryClient = useQueryClient();
  const scanners = useRaceScanners(eventId);

  const [added, setAdded] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  if (scanners.isError) {
    return (
      <ErrorNotice
        title="We could not load the scanners"
        detail="This is a connection problem, not an empty list. Please try again."
        onRetry={() => void scanners.refetch()}
      />
    );
  }
  if (scanners.data === undefined) {
    return <div role="status" aria-label="Loading scanners" className="h-48 animate-pulse rounded-lg bg-n-100" />;
  }

  const indexed = scanners.data;
  const rows: Row[] = [
    ...indexed.map((scanner) => ({ ...scanner, justAdded: false })),
    ...added
      .filter((address) => !indexed.some((scanner) => scanner.address === address))
      .map((address) => ({ address, addedLedger: 0, addedAt: null, scans: null, justAdded: true })),
  ].filter((row) => !removed.includes(row.address));

  const needle = query.trim().toUpperCase();
  const shown = needle === "" ? rows : rows.filter((row) => row.address.includes(needle));
  const showAddedAt = rows.some((row) => row.addedAt !== null);
  const showScans = rows.some((row) => row.scans !== null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["scanners", eventId] });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a wallet"
          aria-label="Search a wallet"
          className="w-full sm:w-72"
        />
        <Button onClick={() => setAdding(true)}>Add scanner</Button>
        <span className="ml-auto text-sm text-n-500">
          {rows.length === 1 ? "1 scanner" : `${rows.length} scanners`}
        </span>
      </div>

      <section className="overflow-hidden rounded-lg border border-n-200 bg-paper">
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-ink">No scanner yet</p>
            <p className="mt-1 text-sm text-n-500">Nobody can check runners in on race day.</p>
          </div>
        ) : shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-n-500">No scanner matches</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th scope="col" className={HEAD}>Wallet</th>
                  {showAddedAt ? <th scope="col" className={HEAD}>Added at</th> : null}
                  {showScans ? <th scope="col" className={HEAD}>Scanned</th> : null}
                  <th scope="col" className={HEAD}>
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {shown.map((row) => (
                  <tr key={row.address}>
                    <td className={`numeric break-all text-ink ${CELL}`}>
                      {row.address}
                      {row.justAdded ? <span className="ml-2 text-xs text-n-500">Just added</span> : null}
                    </td>
                    {showAddedAt ? (
                      <td className={`whitespace-nowrap text-n-600 ${CELL}`}>
                        {row.addedAt === null ? "" : formatEventDate(row.addedAt)}
                      </td>
                    ) : null}
                    {showScans ? (
                      <td className={`numeric text-n-600 ${CELL}`}>{row.scans ?? ""}</td>
                    ) : null}
                    <td className={`w-px text-right whitespace-nowrap ${CELL}`}>
                      <button
                        type="button"
                        aria-label={`Remove ${row.address}`}
                        className="text-sm font-medium text-teal hover:underline"
                        onClick={() => setRemoving(row.address)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AddScannerDialog
        open={adding}
        eventId={eventId}
        organiser={organiser}
        listed={rows.map((row) => row.address)}
        onClose={() => setAdding(false)}
        onAdded={async (address) => {
          setAdded((list) => [...list, address]);
          setRemoved((list) => list.filter((item) => item !== address));
          setAdding(false);
          await refresh();
        }}
      />

      <RemoveScannerDialog
        address={removing}
        eventId={eventId}
        onClose={() => setRemoving(null)}
        onRemoved={async (address) => {
          setRemoved((list) => [...list, address]);
          setAdded((list) => list.filter((item) => item !== address));
          setRemoving(null);
          await refresh();
        }}
      />
    </>
  );
}

function AddScannerDialog({
  open,
  eventId,
  organiser,
  listed,
  onClose,
  onAdded,
}: {
  open: boolean;
  eventId: number;
  organiser: string;
  listed: readonly string[];
  onClose: () => void;
  onAdded: (address: string) => Promise<void>;
}) {
  const { write, phase, isBusy, error, reset } = useAddScanner();
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function close() {
    if (isBusy) return;
    setValue("");
    setProblem(null);
    reset();
    onClose();
  }

  async function submit() {
    const address = value.trim();
    const why = refusal(address, organiser, listed);
    setProblem(why);
    if (why) return;
    try {
      await write({ eventId, scanner: address });
      setValue("");
      reset();
      await onAdded(address);
    } catch {
      // `error` carries it into the dialog.
    }
  }

  const message = problem ?? (error ? friendlyError(error) : null);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a scanner</DialogTitle>
          <DialogDescription>
            Open Sterun on the phone that will do the scanning and copy its wallet address.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="G…"
          aria-label="Wallet address"
          autoComplete="off"
          spellCheck={false}
          disabled={isBusy}
        />
        {message ? (
          <p role="alert" className="text-sm text-danger">
            {message}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={isBusy} onClick={close}>
            Cancel
          </Button>
          <Button disabled={isBusy} onClick={() => void submit()}>
            {isBusy ? (phase === "signing" ? "Confirm in your wallet" : "Adding") : "Sign and add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveScannerDialog({
  address,
  eventId,
  onClose,
  onRemoved,
}: {
  address: string | null;
  eventId: number;
  onClose: () => void;
  onRemoved: (address: string) => Promise<void>;
}) {
  const { write, phase, isBusy, error, reset } = useRemoveScanner();

  function close() {
    if (isBusy) return;
    reset();
    onClose();
  }

  async function confirm() {
    if (address === null) return;
    try {
      await write({ eventId, scanner: address });
      reset();
      await onRemoved(address);
    } catch {
      // `error` carries it into the dialog.
    }
  }

  return (
    <Dialog open={address !== null} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove this scanner?</DialogTitle>
          <DialogDescription>
            This phone will no longer be able to check runners in for this race.
          </DialogDescription>
        </DialogHeader>
        <p className="numeric text-sm break-all text-ink">{address}</p>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {friendlyError(error)}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={isBusy} onClick={close}>
            Cancel
          </Button>
          <Button disabled={isBusy} onClick={() => void confirm()}>
            {isBusy ? (phase === "signing" ? "Confirm in your wallet" : "Removing") : "Sign and remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

If the `outline` Button variant does not exist (checked in Task 3), use the variant Task 3 used.

- [ ] **Step 4: Show it on the Scanners tab**

In `RaceConsole.tsx` add `import { ScannersTab } from "./component/ScannersTab";` and replace
`{/* tab bodies */}` with:

```tsx
        {tab === "scanners" ? <ScannersTab summary={data} /> : null}
```

This is the last tab body, so the marker comment goes.

- [ ] **Step 5: Run the tests and the typecheck**

Run: `pnpm --filter fe test test/ScannersTab.test.tsx test/RaceConsole.test.tsx test/ui-rules.test.ts`
Expected: PASS. If `Keypair` fails to load under jsdom with `expected Uint8Array`
(`fe/CLAUDE.md`, Tests), replace the three `Keypair.random().publicKey()` calls with three fixed
addresses generated once by `node -e "const {Keypair}=require('@stellar/stellar-sdk');for(let i=0;i<3;i++)console.log(Keypair.random().publicKey())"`
run from `fe/`, pasted in as string literals.
Run: `pnpm --filter fe typecheck && pnpm --filter fe lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add fe/src/modules/organiser fe/test/ScannersTab.test.tsx
git commit -m "fe: add and remove scanners from the race page (STE-17)" -m "The scanner app cannot be used until an address is registered, and this is the only place that happens. The dialog refuses the organiser's own wallet, the mistake that only shows up on race morning, and the tab keeps what it signed for until the index catches up so nobody adds the same phone twice."
```

---

## Task 8: Record the rules, look at it, and run the whole gate

**Files:**
- Modify: `fe/CLAUDE.md`

- [ ] **Step 1: Write the race page's rules into `fe/CLAUDE.md`**

In `fe/CLAUDE.md`, in the route table under "Who renders the site header", change the `(console)`
row's Routes cell to `/org`, `/org/events/[id]`, and add this row below `app/(browse)/not-found.tsx`:

```md
| `app/(organiser)/org/(console)/not-found.tsx` | none of its own, the console layout has it | `notFound()` from a console page |
```

Then add a section after "`/org` — the events this wallet organises":

```md
### `/org/events/[id]` — one race (STE-17)

`modules/organiser/RaceConsole.tsx`. Plan:
`docs/superpowers/plans/2026-09-13-org-event-console-tabs.md`. What is settled:

- **Three tabs, Overview, Entries, Scanners, and the tab is in the address** (`?tab=`, parsed by
  `race-tab.ts`, which has no `"use client"` because the route imports it). The bell already links to
  `?tab=scanners`, and the rail lives in a layout that must not remount. **Results is deferred**
  until the backend accepts untimed finishes and DNF rows and there is a way to record many results
  without one signature per runner; `?tab=results` opens Overview until then.
- **The race is read fresh with `useEvent`**, not picked out of the dashboard's list, because this is
  the page it is changed from. A race whose organiser is another wallet gets one sentence and a way
  back, never tabs of buttons that would each fail at the wallet prompt.
- **The header's one action is the status move** (`status-action.ts`): open, close or reopen
  entries, always behind a dialog. The dialog for opening states that a race which has opened never
  returns to not open. Completing and cancelling are not offered here.
- **Nothing in the design is cut because the backend does not send it yet.** Per-entry add-ons
  (`addon_ids`) and a scanner's `added_at` and `scans` are parsed as optional in `lib/records.ts` and
  `lib/scanners.ts`. The column or card that needs one is drawn once the data carries it, and not
  before; nothing is estimated in the meantime.
- **Anything read from the index tells "not answered" from "failed" from "empty"**
  (`useRaceRecordsFailed`). Zero race packs collected on race morning is a finding; a timeout is not.
- **The Scanners tab keeps what it signed for** until the index catches up, shown as "Just added",
  because the index lags a signature by a poll and a scanner that vanished after being paid for gets
  added twice. The add dialog refuses the organiser's own wallet and an already-listed one before
  any signature.
```

- [ ] **Step 2: Look at it in a browser**

Tests do not see CSS (`fe/CLAUDE.md`, jsdom). Ancung reviews by screenshot, so look first:

1. Ancung's dev server is usually running on `localhost:3000`. Check with
   `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/org`. If it is not running, ask
   before starting one; never run `pnpm --filter fe build`.
2. With Playwright MCP, open `/org`, connect the organiser wallet the way the first plan's report
   did (the kit's `@StellarWalletsKit/activeAddress` in localStorage), and open a race from the All
   races table.
3. Screenshot each tab at 1440 by 900 and at 390 by 844, into `.playwright-mcp/` (gitignored).
4. Check, by eye: the tab strip scrolls sideways at 390 and the page body does not
   (`document.documentElement.scrollWidth <= innerWidth`); the rings' key sits under the rings at
   390; no text overlaps in the hover tooltip; the Add scanner dialog fits at 390.
5. Fix what the screenshots show, re-run the affected tests, and commit each fix separately.

- [ ] **Step 3: Run the whole gate**

Ask Ancung before running the full suite (it is heavy on her machine), then:

Run: `pnpm --filter fe test`
Expected: all pass.
Run: `pnpm --filter fe typecheck && pnpm --filter fe lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add fe/CLAUDE.md
git commit -m "fe: write down how the race page works (STE-17)" -m "The optional backend fields are the part most likely to be misread later: a column that is missing today is waiting for data, not forgotten."
```

---

## Self-review

- **Spec coverage.** Overview: three stat cards, Distances rings, Activity, Entries per day with
  hover, Add-ons with Sold out (Tasks 4, 5). Entries: three cards, toolbar outside the card, the six
  columns, bib-or-wallet search, two neutral filters (Task 6; Add-ons column behind ticket A).
  Scanners: search, Add scanner, full wallet, Added at, Scanned, Remove, "Sign and add", which
  address to paste (Task 7; two columns behind ticket B). Phone: tabs scroll and stay visible, rings'
  key underneath (Tasks 2, 4, checked in Task 8). The console 404 carried over from the first plan
  (Task 2). **Deliberately absent:** Results (ticket C), Download roster, Complete and Cancel.
- **Placeholders.** None in code steps. The only conditionals are named checks with exact commands
  (the `outline` Button variant, the teal tokens, `Keypair` under jsdom).
- **Names.** `useRaceRecordsFailed`, `fetchScanners`, `IndexedScanner`, `statusAction`,
  `parseRaceTab`, `raceTabHref`, `areaPaths`, `halfRingPath`, `niceCeiling` are spelled the same in
  every task that uses them. Query keys: `["race-records", id]` and `["scanners", id]`, shared with
  the dashboard and the bell.
