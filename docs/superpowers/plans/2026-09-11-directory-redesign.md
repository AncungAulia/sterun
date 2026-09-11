# Poster-first Race Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/` in `fe/` as a poster-first race directory: a featured row, races in the visitor's chosen province, all races as 16:9 poster cards, a search box and a filter drawer.

**Architecture:** The chain list (`useEvents`) is unchanged. A new `useEventDocuments` hook reads every event's verified metadata document through the same React Query entry the event page uses. All decisions (featured pick, area match, search, sort, filter buckets, card lines) are pure functions in `modules/directory/browse.ts` and `filters.ts`; components only lay them out. Visitor state that must survive a reload (the chosen area) lives in `localStorage`, read through `useSyncExternalStore`.

**Tech Stack:** Next.js 16.3.3 App Router, React 19.2.8, Tailwind v4 with Nabil's tokens, shadcn/ui on the combined `radix-ui` package, `@tanstack/react-query` v5, Vitest 3 + Testing Library (jsdom), lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-11-directory-redesign-design.md`

## Global Constraints

- Branch `feat/directory-redesign`. One commit per task. **Do not push, do not open a PR, do not merge** (Ancung does that).
- Run every command from the repository root `D:\Coding\orca-workspace\sterun` (Git Bash). Single test files: `pnpm --filter fe exec vitest run test/<file>`. The full suite runs only in Task 11.
- Every commit message is English, explains why, and ends with exactly:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01282Bg6Fch4Zhxtjz1yDHJ4
  ```
- All UI text is English. **No em dash (—) or en dash (–) in any UI string** (`fe/test/ui-rules.test.ts` fails on them outside comments). Use "to", a comma, or a hyphen.
- No hex colours, font names or raw px in components. Colours, radii, shadows come from tokens (`bg-n-100`, `text-ink`, `shadow-card`, `shadow-lifted`, `rounded-lg`…). Never edit `fe/app/tokens.css`.
- Poppins never above 600: no `font-bold`. `heading-hero` (Big Shoulders) only at `text-4xl` or larger.
- `.numeric` on dates, counts and amounts.
- React Compiler lint: no `Date.now()` during render, no synchronous `setState` inside `useEffect`. Use `useSyncExternalStore` with a server snapshot of `undefined`.
- Tests never touch the network: mock `@/lib/events` (`listEvents`) and `@/lib/metadata` (`fetchEventMetadata`).
- `fe/AGENTS.md`: Next 16 differs from older docs. Before relying on a `next/image` prop, check `node_modules/next/dist/docs/` (resolved from `fe/`).
- Code comments explain *why*, in the voice of the surrounding files.

## File map

| File | Status | Responsibility |
| --- | --- | --- |
| `fe/src/lib/metadata.ts` | modify | 8s timeout on the document fetch |
| `fe/src/hooks/useEventMetadata.ts` | modify | export `metadataQuery` so the directory shares the cache entry |
| `fe/src/hooks/useEventDocuments.ts` | create | all documents for a list of events |
| `fe/src/lib/area.ts` | create | the chosen area: type, parse, localStorage store |
| `fe/src/hooks/useArea.ts` | create | area as React state |
| `fe/src/hooks/useMediaQuery.ts` | create | drawer side (right on wide screens, bottom on phones) |
| `fe/src/hooks/useNowSeconds.ts` | create | client clock fixed at first paint |
| `fe/src/modules/directory/browse.ts` | create | featured pick, area match, search, sort, card lines |
| `fe/src/modules/directory/filters.ts` | create | buckets, filter matching, location options, chips |
| `fe/src/modules/directory/component/PosterFrame.tsx` | create | 16:9 frame: whole poster over blur, or "No image" |
| `fe/src/modules/directory/component/EventCard.tsx` | rewrite | poster card, three variants |
| `fe/src/components/ui/sheet.tsx`, `radio-group.tsx` | generate | shadcn |
| `fe/src/modules/directory/component/FilterDrawer.tsx` | create | staged filters in a sheet |
| `fe/src/modules/directory/component/FilterChips.tsx` | create | applied filters as removable chips |
| `fe/src/modules/directory/component/AreaPicker.tsx` | create | header button + dialog |
| `fe/src/modules/directory/component/AreaForm.tsx` | create | lazy-loaded country/province form |
| `fe/src/modules/directory/component/FeaturedEvents.tsx` | create | one large card, up to two beside it |
| `fe/src/modules/directory/component/DirectorySkeleton.tsx` | modify | poster-shaped skeleton |
| `fe/src/modules/directory/Directory.tsx` | rewrite | the page |
| `fe/src/modules/organiser/component/StepDetails.tsx` | modify | 16:9 poster hint |
| `fe/test/fixtures/directory.ts` | create | shared builders (not a test file) |
| `docs/WEB_APP_IA.md`, `fe/CLAUDE.md` | modify | record the decisions |

---

### Task 1: Document fetch timeout and a shared metadata query

**Files:**
- Modify: `fe/src/lib/metadata.ts` (the `fetchEventMetadata` function, lines ~101-143)
- Modify: `fe/src/hooks/useEventMetadata.ts` (whole file)
- Test: `fe/test/metadata.test.ts` (append), `fe/test/useEventMetadata.test.tsx` (unchanged, must stay green)

**Interfaces:**
- Produces: `METADATA_TIMEOUT_MS: 8000` from `@/lib/metadata`; `metadataQuery(uri: string, metadataHash: string)` from `@/hooks/useEventMetadata`, returning TanStack `queryOptions` with key `["event-metadata", uri, metadataHash]`.

- [ ] **Step 1: Write the failing tests**

In `fe/test/metadata.test.ts`, change the import line to:

```ts
import {
  METADATA_TIMEOUT_MS,
  fetchEventMetadata,
  gunStartConflict,
  readEventDocument,
} from "@/lib/metadata";
```

Append at the end of the file:

```ts
describe("fetchEventMetadata deadline", () => {
  it("gives the request a deadline", async () => {
    const fetchMock = vi.fn<(uri: string, init?: RequestInit) => Promise<unknown>>(async () => ({
      ok: true,
      status: 200,
      text: async () => BODY,
    }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchEventMetadata(URI, HASH);

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(METADATA_TIMEOUT_MS).toBe(8_000);
  });

  it("reports a host that never answered as unavailable, and says it was slow", async () => {
    // A host that accepts the connection and never replies used to leave the
    // query pending for good, which held the whole directory's featured row.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      }),
    );

    const result = await fetchEventMetadata(URI, HASH);

    expect(result).toEqual({
      status: "unavailable",
      reason: "The metadata document took too long to answer.",
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter fe exec vitest run test/metadata.test.ts`
Expected: FAIL — `METADATA_TIMEOUT_MS` is not exported / `signal` is undefined.

- [ ] **Step 3: Implement the timeout**

In `fe/src/lib/metadata.ts`, directly above `export async function fetchEventMetadata(`, add:

```ts
/**
 * How long a document host gets to answer before the page stops waiting.
 *
 * Without a deadline, a host that accepts the connection and never replies
 * leaves the read pending for as long as the browser cares to wait. On the
 * directory that holds back every section that needs all documents in hand.
 * Eight seconds is well past a slow mobile response and short of someone
 * giving up on the page.
 */
export const METADATA_TIMEOUT_MS = 8_000;
```

Replace `const response = await fetch(uri);` with:

```ts
    const response = await fetch(uri, { signal: AbortSignal.timeout(METADATA_TIMEOUT_MS) });
```

Replace the line `  } catch {` that belongs to that same `try` (the one followed by the comment "The message is deliberately not the browser's") with:

```ts
  } catch (error) {
    if (typeof error === "object" && error !== null && "name" in error && error.name === "TimeoutError") {
      return { status: "unavailable", reason: "The metadata document took too long to answer." };
    }
```

Leave the existing comment and `return { status: "unavailable", reason: "The metadata document could not be reached." };` after it unchanged.

- [ ] **Step 4: Share the query definition**

Replace the whole of `fe/src/hooks/useEventMetadata.ts` with:

```ts
/**
 * STE-13 — the off-chain event document, fetched and checked against the hash
 * the chain committed to.
 *
 * Separate from `useEvent` because the two have nothing in common but an event:
 * one is an RPC simulation against a Soroban node, the other an HTTP GET to
 * whatever host the organiser chose. That host is frequently a parked domain or
 * a dead link, and a failure there must not take the event page with it.
 */
import { queryOptions, useQuery } from "@tanstack/react-query";

import { fetchEventMetadata, type MetadataResult } from "@/lib/metadata";

/**
 * Events are frozen once created (WEB_APP_IA.md §2.2), so a document that
 * verifies once verifies forever. There is nothing to refetch.
 */
const FOREVER = Number.POSITIVE_INFINITY;

/**
 * The query for one document, shared by the event page and the directory. Both
 * read the same cache entry, so a race opened from the directory already has
 * its document verified.
 */
export function metadataQuery(uri: string, metadataHash: string) {
  return queryOptions<MetadataResult>({
    // The hash is part of the key, not just the url. A url can be reused by a
    // later event with different content, and reading the previous document out
    // of cache would show one event's poster on another.
    queryKey: ["event-metadata", uri, metadataHash],
    queryFn: () => fetchEventMetadata(uri, metadataHash),
    enabled: uri.length > 0,
    staleTime: FOREVER,
    // fetchEventMetadata reports failure in its result rather than throwing, so
    // a retry would only repeat a request that already answered.
    retry: false,
  });
}

export function useEventMetadata(uri: string, metadataHash: string) {
  return useQuery(metadataQuery(uri, metadataHash));
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter fe exec vitest run test/metadata.test.ts test/useEventMetadata.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add fe/src/lib/metadata.ts fe/src/hooks/useEventMetadata.ts fe/test/metadata.test.ts
git commit -F - <<'EOF'
fe: give the event document fetch a deadline and share its query

A document host that accepts a connection and never answers left the query
pending indefinitely. The directory is about to wait for every document
before choosing featured races, so one dead host would hold the row back.

The query options move into metadataQuery so the directory reads the same
cache entry as the event page instead of verifying each document twice.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01282Bg6Fch4Zhxtjz1yDHJ4
EOF
```

---

### Task 2: `useEventDocuments` and shared test fixtures

**Files:**
- Create: `fe/test/fixtures/directory.ts`
- Create: `fe/src/hooks/useEventDocuments.ts`
- Test: `fe/test/useEventDocuments.test.tsx`

**Interfaces:**
- Consumes: `metadataQuery` (Task 1).
- Produces:
  - `useEventDocuments(events: readonly EventSummary[]): EventDocuments` where
    `EventDocuments = { byEvent: ReadonlyMap<number, EventMetadata | null>; pending: ReadonlySet<number>; settled: boolean }`.
  - Fixtures from `fe/test/fixtures/directory.ts`: `SUSD`, `daysFromNow(days)`, `summary(eventId, overrides?, categories?)`, `category(categoryId, overrides?)`, `metadata(overrides?)`, `entry(summary, document?)`.

- [ ] **Step 1: Create the fixtures**

`fe/test/fixtures/directory.ts`:

```ts
/**
 * Builders shared by the directory's tests. Not a test file itself: vitest only
 * collects `*.test.ts(x)`.
 */
import type { EventStatus, SterunCategory, SterunEvent } from "@sterunxyz/sdk";

import type { EventSummary } from "@/lib/events";
import type { EventMetadata } from "@/lib/metadata";

/** Stroops in one sUSD. */
export const SUSD = 10_000_000n;

const DAY_S = 86_400n;

/** Unix seconds whole days from the real clock, so "upcoming" holds whenever the suite runs. */
export function daysFromNow(days: number): bigint {
  return BigInt(Math.floor(Date.now() / 1000)) + BigInt(days) * DAY_S;
}

export function summary(
  eventId: number,
  overrides: Partial<SterunEvent> = {},
  categories: SterunCategory[] = [],
): EventSummary {
  return {
    event: {
      eventId,
      organiser: "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN",
      name: `Jakarta Marathon ${eventId}`,
      metadataHash: "a".repeat(64),
      uri: "",
      startsAt: daysFromNow(30),
      status: "Open" as EventStatus,
      ...overrides,
    },
    categories,
  };
}

export function category(categoryId: number, overrides: Partial<SterunCategory> = {}): SterunCategory {
  const quota = overrides.quota ?? 300;
  const enteredCount = overrides.enteredCount ?? 180;
  return {
    eventId: 0,
    categoryId,
    code: "10K",
    distanceM: 10_000,
    quota,
    enteredCount,
    priceStroops: 25n * SUSD,
    slotsLeft: quota - enteredCount,
    ...overrides,
  };
}

export function metadata(overrides: Partial<EventMetadata> = {}): EventMetadata {
  return {
    posterUrl: "https://files.test/poster.jpg",
    location: {
      name: "FT UGM",
      city: "Sleman",
      province: "DI Yogyakarta",
      country: "Indonesia",
      countryCode: "ID",
    },
    ...overrides,
  };
}

export function entry(eventSummary: EventSummary, document: EventMetadata | null = null) {
  return { summary: eventSummary, document };
}
```

- [ ] **Step 2: Write the failing test**

`fe/test/useEventDocuments.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEventDocuments } from "@/hooks/useEventDocuments";
import { useEventMetadata } from "@/hooks/useEventMetadata";

import { metadata, summary } from "./fixtures/directory";

const fetchEventMetadata = vi.hoisted(() => vi.fn());

vi.mock("@/lib/metadata", () => ({ fetchEventMetadata }));

const HASH = "ab".repeat(32);

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function served(eventId: number) {
  return summary(eventId, { uri: `https://files.test/${eventId}.json`, metadataHash: HASH });
}

beforeEach(() => fetchEventMetadata.mockReset());

describe("useEventDocuments", () => {
  describe("positive", () => {
    it("keys each verified document by its event", async () => {
      fetchEventMetadata.mockImplementation(async (uri: string) => ({
        status: "verified",
        document: metadata({ description: uri }),
      }));
      const events = [served(0), served(1)];

      const { result } = renderHook(() => useEventDocuments(events), { wrapper: wrapper() });

      await waitFor(() => expect(result.current.settled).toBe(true));
      expect(result.current.byEvent.get(0)?.description).toBe("https://files.test/0.json");
      expect(result.current.byEvent.get(1)?.description).toBe("https://files.test/1.json");
    });

    it("shares the cache with the event page, so a document is fetched once", async () => {
      fetchEventMetadata.mockResolvedValue({ status: "verified", document: metadata() });
      const Wrapper = wrapper();
      const events = [served(0)];

      const list = renderHook(() => useEventDocuments(events), { wrapper: Wrapper });
      await waitFor(() => expect(list.result.current.settled).toBe(true));
      const page = renderHook(() => useEventMetadata("https://files.test/0.json", HASH), {
        wrapper: Wrapper,
      });
      await waitFor(() => expect(page.result.current.isSuccess).toBe(true));

      expect(fetchEventMetadata).toHaveBeenCalledTimes(1);
    });
  });

  describe("edge", () => {
    it("does not wait for an event that has no document", () => {
      const events = [summary(0)];

      const { result } = renderHook(() => useEventDocuments(events), { wrapper: wrapper() });

      expect(result.current.settled).toBe(true);
      expect(result.current.byEvent.get(0)).toBeNull();
      expect(fetchEventMetadata).not.toHaveBeenCalled();
    });

    it("is not settled while a document is still on its way", async () => {
      let resolve!: (value: unknown) => void;
      fetchEventMetadata.mockReturnValue(
        new Promise((r) => {
          resolve = r;
        }),
      );
      const events = [served(0)];

      const { result } = renderHook(() => useEventDocuments(events), { wrapper: wrapper() });

      expect(result.current.settled).toBe(false);
      expect(result.current.pending.has(0)).toBe(true);
      await act(async () => {
        resolve({ status: "verified", document: metadata() });
      });
      await waitFor(() => expect(result.current.settled).toBe(true));
      expect(result.current.pending.size).toBe(0);
    });

    it("answers for an empty list", () => {
      const { result } = renderHook(() => useEventDocuments([]), { wrapper: wrapper() });

      expect(result.current.settled).toBe(true);
      expect(result.current.byEvent.size).toBe(0);
    });
  });

  describe("negative", () => {
    it("leaves out a document that fails its hash check", async () => {
      fetchEventMetadata.mockResolvedValue({
        status: "modified",
        expectedHash: HASH,
        actualHash: "cd".repeat(32),
      });
      const events = [served(0)];

      const { result } = renderHook(() => useEventDocuments(events), { wrapper: wrapper() });

      await waitFor(() => expect(result.current.settled).toBe(true));
      expect(result.current.byEvent.get(0)).toBeNull();
    });

    it("leaves out a document that could not be read", async () => {
      fetchEventMetadata.mockResolvedValue({ status: "unavailable", reason: "down" });
      const events = [served(0)];

      const { result } = renderHook(() => useEventDocuments(events), { wrapper: wrapper() });

      await waitFor(() => expect(result.current.settled).toBe(true));
      expect(result.current.byEvent.get(0)).toBeNull();
    });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter fe exec vitest run test/useEventDocuments.test.tsx`
Expected: FAIL — cannot resolve `@/hooks/useEventDocuments`.

- [ ] **Step 4: Implement the hook**

`fe/src/hooks/useEventDocuments.ts`:

```ts
/**
 * Every event's document, for the directory.
 *
 * One query per event, built from `metadataQuery`: the same cache entry the
 * event page reads, so opening a race after browsing does not fetch or hash its
 * document again. The hash check is not relaxed here either. A `modified` or
 * `unavailable` document is simply absent, and the card says "No image"
 * (WEB_APP_IA.md §6: an unproven document is not shown at all).
 */
import { useQueries } from "@tanstack/react-query";

import { metadataQuery } from "@/hooks/useEventMetadata";
import type { EventSummary } from "@/lib/events";
import type { EventMetadata } from "@/lib/metadata";

export interface EventDocuments {
  /** Event id to its verified document, or null when there is none to show. */
  byEvent: ReadonlyMap<number, EventMetadata | null>;
  /** Events whose document has not answered yet. */
  pending: ReadonlySet<number>;
  /** True once no document is still on its way. */
  settled: boolean;
}

export function useEventDocuments(events: readonly EventSummary[]): EventDocuments {
  return useQueries({
    queries: events.map(({ event }) => metadataQuery(event.uri, event.metadataHash)),
    combine: (results) => {
      const byEvent = new Map<number, EventMetadata | null>();
      const pending = new Set<number>();
      results.forEach((result, index) => {
        const event = events[index]?.event;
        if (!event) return;
        // A query without a uri is disabled: it reports "pending" for ever and
        // never fetches. There is nothing to wait for, so it counts as answered.
        if (event.uri.length > 0 && result.isPending) pending.add(event.eventId);
        byEvent.set(
          event.eventId,
          result.data?.status === "verified" ? result.data.document : null,
        );
      });
      return { byEvent, pending, settled: pending.size === 0 };
    },
  });
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter fe exec vitest run test/useEventDocuments.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add fe/src/hooks/useEventDocuments.ts fe/test/useEventDocuments.test.tsx fe/test/fixtures/directory.ts
git commit -F - <<'EOF'
fe: read every event's document for the directory

Posters, venues and provinces only exist in each event's document, and the
directory never fetched it. This reads them all through the event page's own
verified query, so a document that fails its hash stays absent here too.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01282Bg6Fch4Zhxtjz1yDHJ4
EOF
```

---

### Task 3: Client-only state: area, media query, clock

**Files:**
- Create: `fe/src/lib/area.ts`, `fe/src/hooks/useArea.ts`, `fe/src/hooks/useMediaQuery.ts`, `fe/src/hooks/useNowSeconds.ts`
- Test: `fe/test/useArea.test.tsx`, `fe/test/useMediaQuery.test.tsx`

**Interfaces:**
- Produces:
  - `interface Area { countryCode: string; country: string; province: string }`, `AREA_STORAGE_KEY = "sterun.area"`, `parseArea(raw: string | null): Area | null` from `@/lib/area`.
  - `useArea(): { area: Area | null; setArea: (area: Area) => void; clearArea: () => void }`.
  - `useMediaQuery(query: string): boolean` (false on the server).
  - `useNowSeconds(): bigint | undefined` (undefined on the server).

- [ ] **Step 1: Write the failing tests**

`fe/test/useArea.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useArea } from "@/hooks/useArea";
import { AREA_STORAGE_KEY, parseArea } from "@/lib/area";

const YOGYA = { countryCode: "ID", country: "Indonesia", province: "DI Yogyakarta" };

beforeEach(() => window.localStorage.clear());

describe("useArea", () => {
  describe("positive", () => {
    it("starts with no area", () => {
      const { result } = renderHook(() => useArea());

      expect(result.current.area).toBeNull();
    });

    it("keeps a chosen area in this browser and hands it back", () => {
      const { result } = renderHook(() => useArea());

      act(() => result.current.setArea(YOGYA));

      expect(result.current.area).toEqual(YOGYA);
      expect(JSON.parse(window.localStorage.getItem(AREA_STORAGE_KEY) ?? "null")).toEqual(YOGYA);
    });

    it("forgets the area when cleared", () => {
      const { result } = renderHook(() => useArea());
      act(() => result.current.setArea(YOGYA));

      act(() => result.current.clearArea());

      expect(result.current.area).toBeNull();
      expect(window.localStorage.getItem(AREA_STORAGE_KEY)).toBeNull();
    });
  });

  describe("edge", () => {
    it("reads an area saved on an earlier visit", () => {
      window.localStorage.setItem(AREA_STORAGE_KEY, JSON.stringify(YOGYA));

      const { result } = renderHook(() => useArea());

      expect(result.current.area).toEqual(YOGYA);
    });

    it("follows a change made in another tab", () => {
      const { result } = renderHook(() => useArea());

      act(() => {
        window.localStorage.setItem(AREA_STORAGE_KEY, JSON.stringify(YOGYA));
        window.dispatchEvent(new StorageEvent("storage", { key: AREA_STORAGE_KEY }));
      });

      expect(result.current.area).toEqual(YOGYA);
    });

    it("trims the province it reads", () => {
      expect(parseArea(JSON.stringify({ ...YOGYA, province: "  DI Yogyakarta " }))).toEqual(YOGYA);
    });
  });

  describe("negative", () => {
    it.each([
      ["not JSON", "{"],
      ["missing the province", JSON.stringify({ countryCode: "ID", country: "Indonesia" })],
      ["a lowercase country code", JSON.stringify({ ...YOGYA, countryCode: "id" })],
      ["a blank province", JSON.stringify({ ...YOGYA, province: "   " })],
      ["missing the country name", JSON.stringify({ countryCode: "ID", province: "Bali" })],
      ["not an object", JSON.stringify("DI Yogyakarta")],
    ])("ignores a stored value that is %s", (_label, raw) => {
      expect(parseArea(raw)).toBeNull();
    });

    it("carries on without an area when storage refuses", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("denied");
      });

      const { result } = renderHook(() => useArea());

      expect(result.current.area).toBeNull();
    });
  });
});
```

`fe/test/useMediaQuery.test.tsx`:

```tsx
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useMediaQuery } from "@/hooks/useMediaQuery";

const original = window.matchMedia;

function answer(matching: string) {
  window.matchMedia = ((query: string) => ({
    matches: query === matching,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

afterEach(() => {
  window.matchMedia = original;
});

describe("useMediaQuery", () => {
  it("is true when the query matches", () => {
    answer("(min-width: 640px)");

    const { result } = renderHook(() => useMediaQuery("(min-width: 640px)"));

    expect(result.current).toBe(true);
  });

  it("is false when it does not", () => {
    answer("(min-width: 1024px)");

    const { result } = renderHook(() => useMediaQuery("(min-width: 640px)"));

    expect(result.current).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter fe exec vitest run test/useArea.test.tsx test/useMediaQuery.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`fe/src/lib/area.ts`:

```ts
/**
 * The visitor's chosen area, kept in this browser only.
 *
 * Not an account setting: there are no accounts, and a province is not worth a
 * server round trip. localStorage can refuse (a private window, storage turned
 * off), so every access is guarded and the page simply works without an area.
 *
 * The country name is stored beside its code so the header can name the area
 * without loading the places dataset, which is 176 KB and only needed once the
 * visitor opens the picker.
 */
export interface Area {
  /** ISO 3166-1 alpha-2, the same code event documents carry. */
  countryCode: string;
  country: string;
  /** The province as the places dataset spells it, e.g. "DI Yogyakarta". */
  province: string;
}

export const AREA_STORAGE_KEY = "sterun.area";

export function parseArea(raw: string | null): Area | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { countryCode, country, province } = value as Record<string, unknown>;
  if (typeof countryCode !== "string" || !/^[A-Z]{2}$/.test(countryCode)) return null;
  if (typeof country !== "string" || country.trim().length === 0) return null;
  if (typeof province !== "string" || province.trim().length === 0) return null;
  return { countryCode, country: country.trim(), province: province.trim() };
}

const listeners = new Set<() => void>();
let lastRaw: string | null | undefined;
let lastArea: Area | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(AREA_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * The stored area. The same object until the stored text changes, because
 * `useSyncExternalStore` re-renders for ever on a snapshot that is new each call.
 */
export function readArea(): Area | null {
  const raw = readRaw();
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastArea = parseArea(raw);
  }
  return lastArea;
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function storeArea(area: Area): void {
  try {
    window.localStorage.setItem(AREA_STORAGE_KEY, JSON.stringify(area));
  } catch {
    // Refused. The page carries on without an area, as it does on a first visit.
  }
  notify();
}

export function clearStoredArea(): void {
  try {
    window.localStorage.removeItem(AREA_STORAGE_KEY);
  } catch {
    // Nothing was stored to begin with.
  }
  notify();
}

/** Changes from this tab, and from other tabs through the storage event. */
export function subscribeArea(listener: () => void): () => void {
  listeners.add(listener);
  function onStorage(event: StorageEvent) {
    if (event.key === AREA_STORAGE_KEY) listener();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
```

`fe/src/hooks/useArea.ts`:

```ts
import { useSyncExternalStore } from "react";

import { clearStoredArea, readArea, storeArea, subscribeArea, type Area } from "@/lib/area";

function serverArea(): undefined {
  return undefined;
}

/**
 * The chosen area, read on the client only.
 *
 * The server has no localStorage, so its snapshot is `undefined` and the first
 * client paint matches the markup it sent. The area appears one frame later.
 */
export function useArea() {
  const area = useSyncExternalStore<Area | null | undefined>(subscribeArea, readArea, serverArea);
  return { area: area ?? null, setArea: storeArea, clearArea: clearStoredArea };
}
```

`fe/src/hooks/useMediaQuery.ts`:

```ts
import { useSyncExternalStore } from "react";

/** Whether a media query matches. False on the server, which has no viewport. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
```

`fe/src/hooks/useNowSeconds.ts`:

```ts
import { useSyncExternalStore } from "react";

/**
 * The moment the page first painted, in unix seconds, on the client only.
 *
 * Same reasoning as TabTimeline's clock: the server's clock is not the
 * browser's, so the server snapshot is `undefined`, and the value is fixed at
 * first paint because `useSyncExternalStore` needs a snapshot that stops
 * changing. Races are days apart; a page left open for an hour loses nothing.
 */
let firstPaintS: bigint | undefined;

function subscribe() {
  return () => {};
}

function clientNow(): bigint {
  firstPaintS ??= BigInt(Math.floor(Date.now() / 1000));
  return firstPaintS;
}

function serverNow(): undefined {
  return undefined;
}

export function useNowSeconds(): bigint | undefined {
  return useSyncExternalStore(subscribe, clientNow, serverNow);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter fe exec vitest run test/useArea.test.tsx test/useMediaQuery.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add fe/src/lib/area.ts fe/src/hooks/useArea.ts fe/src/hooks/useMediaQuery.ts fe/src/hooks/useNowSeconds.ts fe/test/useArea.test.tsx fe/test/useMediaQuery.test.tsx
git commit -F - <<'EOF'
fe: keep the visitor's area, the viewport and the clock as client state

The directory needs three things the server cannot know: which province the
visitor picked, whether the screen is wide enough for a side drawer, and the
time. All three go through useSyncExternalStore with an undefined server
snapshot, the pattern the React Compiler lint allows.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01282Bg6Fch4Zhxtjz1yDHJ4
EOF
```

---

### Task 4: Directory decisions as pure functions (`browse.ts`)

**Files:**
- Create: `fe/src/modules/directory/browse.ts`
- Test: `fe/test/browse.test.ts`

**Interfaces:**
- Consumes: `Area` (Task 3), `sortEvents` / `EventSummary` from `@/lib/events`, `formatPrice` from `@/utils/format`.
- Produces:
  - `interface DirectoryEntry { summary: EventSummary; document: EventMetadata | null }`
  - `type DateOrder = "soonest" | "latest"`, `FEATURED_LIMIT = 3`
  - `pickFeatured(entries, nowS: bigint, limit?): DirectoryEntry[]`
  - `inArea(entry, area: Area): boolean`
  - `matchesSearch(entry, query: string): boolean`
  - `sortByDate(entries, order: DateOrder, nowS: bigint): DirectoryEntry[]`
  - `entriesLine(summary: EventSummary): string | null`
  - `priceLine(categories: readonly SterunCategory[]): string | null`
  - `placeLine(document: EventMetadata | null): string | null`

- [ ] **Step 1: Write the failing test**

`fe/test/browse.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  entriesLine,
  inArea,
  matchesSearch,
  pickFeatured,
  placeLine,
  priceLine,
  sortByDate,
} from "@/modules/directory/browse";

import { SUSD, category, entry, metadata, summary } from "./fixtures/directory";

const NOW = 1_800_000_000n;
const DAY = 86_400n;
const YOGYA = { countryCode: "ID", country: "Indonesia", province: "DI Yogyakarta" };

function ids(entries: { summary: { event: { eventId: number } } }[]) {
  return entries.map((item) => item.summary.event.eventId);
}

describe("pickFeatured", () => {
  it("takes open, upcoming races that have a poster, soonest first", () => {
    const later = entry(summary(1, { startsAt: NOW + 9n * DAY }), metadata());
    const sooner = entry(summary(2, { startsAt: NOW + 2n * DAY }), metadata());

    expect(ids(pickFeatured([later, sooner], NOW))).toEqual([2, 1]);
  });

  it("holds at most three", () => {
    const entries = [1, 2, 3, 4].map((id) =>
      entry(summary(id, { startsAt: NOW + BigInt(id) * DAY }), metadata()),
    );

    expect(ids(pickFeatured(entries, NOW))).toEqual([1, 2, 3]);
  });

  it("breaks a tie on the date by event id", () => {
    const b = entry(summary(8, { startsAt: NOW + DAY }), metadata());
    const a = entry(summary(3, { startsAt: NOW + DAY }), metadata());

    expect(ids(pickFeatured([b, a], NOW))).toEqual([3, 8]);
  });

  it("returns nothing when there are no races", () => {
    expect(pickFeatured([], NOW)).toEqual([]);
  });

  it.each([
    ["has no poster", entry(summary(1, { startsAt: NOW + DAY }), metadata({ posterUrl: undefined }))],
    ["has no proven document", entry(summary(1, { startsAt: NOW + DAY }), null)],
    ["is not open", entry(summary(1, { startsAt: NOW + DAY, status: "Closed" }), metadata())],
    ["has already run", entry(summary(1, { startsAt: NOW - DAY }), metadata())],
  ])("leaves out a race that %s", (_label, candidate) => {
    expect(pickFeatured([candidate], NOW)).toEqual([]);
  });
});

describe("inArea", () => {
  it("matches a race in the same country and province", () => {
    expect(inArea(entry(summary(1), metadata()), YOGYA)).toBe(true);
  });

  it("ignores case and surrounding spaces in the province", () => {
    const race = entry(summary(1), metadata({ location: { province: " di yogyakarta ", countryCode: "ID" } }));

    expect(inArea(race, YOGYA)).toBe(true);
  });

  it("does not match another province", () => {
    const race = entry(summary(1), metadata({ location: { province: "DKI Jakarta", countryCode: "ID" } }));

    expect(inArea(race, YOGYA)).toBe(false);
  });

  it("does not match a province of the same name in another country", () => {
    const race = entry(summary(1), metadata({ location: { province: "DI Yogyakarta", countryCode: "MY" } }));

    expect(inArea(race, YOGYA)).toBe(false);
  });

  it.each([
    ["no document", entry(summary(1), null)],
    ["no location", entry(summary(1), metadata({ location: undefined }))],
    ["no province", entry(summary(1), metadata({ location: { countryCode: "ID", city: "Sleman" } }))],
  ])("does not match a race with %s", (_label, race) => {
    expect(inArea(race, YOGYA)).toBe(false);
  });
});

describe("matchesSearch", () => {
  const race = entry(summary(1, { name: "Elektro Dash 2026" }), metadata());

  it("matches everything on an empty query", () => {
    expect(matchesSearch(race, "   ")).toBe(true);
  });

  it.each([
    ["the name, in any case", "elektro"],
    ["the venue", "ft ugm"],
    ["the city", "Sleman"],
    ["the province", "yogyakarta"],
  ])("matches %s", (_label, query) => {
    expect(matchesSearch(race, query)).toBe(true);
  });

  it("does not match text that is nowhere on the race", () => {
    expect(matchesSearch(race, "bandung")).toBe(false);
  });

  it("cannot match a city when the document is not proven", () => {
    expect(matchesSearch(entry(summary(1, { name: "Elektro Dash" }), null), "sleman")).toBe(false);
  });
});

describe("sortByDate", () => {
  const past = entry(summary(1, { startsAt: NOW - 5n * DAY }));
  const recentPast = entry(summary(2, { startsAt: NOW - DAY }));
  const soon = entry(summary(3, { startsAt: NOW + DAY }));
  const later = entry(summary(4, { startsAt: NOW + 9n * DAY }));

  it("puts upcoming races soonest first, then past races most recent first", () => {
    expect(ids(sortByDate([past, later, recentPast, soon], "soonest", NOW))).toEqual([3, 4, 2, 1]);
  });

  it("puts upcoming races latest first, and still keeps past races below them", () => {
    expect(ids(sortByDate([past, later, recentPast, soon], "latest", NOW))).toEqual([4, 3, 2, 1]);
  });
});

describe("entriesLine", () => {
  it("counts entries left across distances", () => {
    const race = summary(1, {}, [category(0), category(1, { quota: 50, enteredCount: 20 })]);

    expect(entriesLine(race)).toBe("150 entries left");
  });

  it("says one entry, not one entries", () => {
    expect(entriesLine(summary(1, {}, [category(0, { quota: 5, enteredCount: 4 })]))).toBe("1 entry left");
  });

  it("says Sold out when every distance is full", () => {
    expect(entriesLine(summary(1, {}, [category(0, { quota: 5, enteredCount: 5 })]))).toBe("Sold out");
  });

  it("says nothing for a race without distances", () => {
    expect(entriesLine(summary(1))).toBeNull();
  });

  it("says nothing for a race that is not open", () => {
    expect(entriesLine(summary(1, { status: "Closed" }, [category(0)]))).toBeNull();
  });
});

describe("priceLine", () => {
  it("starts from the cheapest distance", () => {
    const categories = [category(0, { priceStroops: 40n * SUSD }), category(1, { priceStroops: 25n * SUSD })];

    expect(priceLine(categories)).toBe("From sUSD 25");
  });

  it("says Free when every distance is free", () => {
    expect(priceLine([category(0, { priceStroops: 0n }), category(1, { priceStroops: 0n })])).toBe("Free");
  });

  it("gives the range when only some distances are free", () => {
    const categories = [category(0, { priceStroops: 0n }), category(1, { priceStroops: 40n * SUSD })];

    expect(priceLine(categories)).toBe("Free to sUSD 40");
  });

  it("says nothing without distances", () => {
    expect(priceLine([])).toBeNull();
  });
});

describe("placeLine", () => {
  it("joins the venue and the city", () => {
    expect(placeLine(metadata())).toBe("FT UGM, Sleman");
  });

  it("does not repeat a city the venue already names", () => {
    expect(placeLine(metadata({ location: { name: "GBK, Jakarta", city: "Jakarta" } }))).toBe("GBK, Jakarta");
  });

  it("uses whichever of the two the document has", () => {
    expect(placeLine(metadata({ location: { city: "Sleman" } }))).toBe("Sleman");
    expect(placeLine(metadata({ location: { name: "FT UGM" } }))).toBe("FT UGM");
  });

  it("says nothing without a proven location", () => {
    expect(placeLine(null)).toBeNull();
    expect(placeLine(metadata({ location: undefined }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter fe exec vitest run test/browse.test.ts`
Expected: FAIL — cannot resolve `@/modules/directory/browse`.

- [ ] **Step 3: Implement**

`fe/src/modules/directory/browse.ts`:

```ts
/**
 * The directory's decisions, as plain functions: which races are featured,
 * which are in the visitor's area, what a search matches, the order, and what a
 * card says.
 *
 * Out of the components so every rule is tested on its own, without a
 * QueryClient or a DOM, and so the page file stays a description of layout.
 */
import type { SterunCategory } from "@sterunxyz/sdk";

import type { Area } from "@/lib/area";
import { sortEvents, type EventSummary } from "@/lib/events";
import type { EventMetadata } from "@/lib/metadata";
import { formatPrice } from "@/utils/format";

/** One race as the directory holds it: the chain's facts and, when proven, its document. */
export interface DirectoryEntry {
  summary: EventSummary;
  /** The verified document. Null when it is missing, unproven, or still loading. */
  document: EventMetadata | null;
}

export type DateOrder = "soonest" | "latest";

/** One large card and two beside it. */
export const FEATURED_LIMIT = 3;

function normalise(text: string | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

function compareBigint(a: bigint, b: bigint): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * The races worth a large poster: open for entry, still ahead, and with a
 * poster to show. Soonest first, because a race next week needs the space more
 * than one next year.
 */
export function pickFeatured(
  entries: readonly DirectoryEntry[],
  nowS: bigint,
  limit = FEATURED_LIMIT,
): DirectoryEntry[] {
  return entries
    .filter(
      ({ summary, document }) =>
        Boolean(document?.posterUrl) &&
        summary.event.status === "Open" &&
        summary.event.startsAt >= nowS,
    )
    .sort(
      (a, b) =>
        compareBigint(a.summary.event.startsAt, b.summary.event.startsAt) ||
        a.summary.event.eventId - b.summary.event.eventId,
    )
    .slice(0, limit);
}

/**
 * Whether a race is in the visitor's chosen area.
 *
 * By province rather than city: Sleman and the city of Yogyakarta are different
 * cities a short ride apart, and somebody who picked one wants the other.
 */
export function inArea(entry: DirectoryEntry, area: Area): boolean {
  const location = entry.document?.location;
  if (!location?.countryCode || !location.province) return false;
  return (
    location.countryCode === area.countryCode &&
    normalise(location.province) === normalise(area.province)
  );
}

/** A case-insensitive match on the race name, venue, city and province. */
export function matchesSearch(entry: DirectoryEntry, query: string): boolean {
  const needle = normalise(query);
  if (!needle) return true;
  const location = entry.document?.location;
  return [entry.summary.event.name, location?.name, location?.city, location?.province].some(
    (field) => normalise(field).includes(needle),
  );
}

/**
 * Races in date order. Upcoming ones always come first, and races already run
 * stay below them most recent first whichever way the upcoming ones go: "latest
 * first" is a question about races you can still enter.
 */
export function sortByDate(
  entries: readonly DirectoryEntry[],
  order: DateOrder,
  nowS: bigint,
): DirectoryEntry[] {
  const bySummary = new Map(entries.map((item) => [item.summary, item]));
  const sorted = sortEvents(
    entries.map((item) => item.summary),
    nowS,
  );
  const ordered =
    order === "latest"
      ? [
          ...sorted.filter((item) => item.event.startsAt >= nowS).reverse(),
          ...sorted.filter((item) => item.event.startsAt < nowS),
        ]
      : sorted;
  return ordered.flatMap((item) => bySummary.get(item) ?? []);
}

/** "500 entries left", "1 entry left" or "Sold out". Only for a race open for entry. */
export function entriesLine(summary: EventSummary): string | null {
  if (summary.event.status !== "Open" || summary.categories.length === 0) return null;
  const left = summary.categories.reduce((total, category) => total + category.slotsLeft, 0);
  if (left === 0) return "Sold out";
  return `${left} ${left === 1 ? "entry" : "entries"} left`;
}

/**
 * What entering costs, read from the cheapest distance: "From sUSD 25", "Free",
 * or "Free to sUSD 40" when some distances are free and some are not. A bare
 * "Free" there would promise a free marathon.
 */
export function priceLine(categories: readonly SterunCategory[]): string | null {
  if (categories.length === 0) return null;
  const prices = categories.map((category) => category.priceStroops);
  const lowest = prices.reduce((min, price) => (price < min ? price : min));
  const highest = prices.reduce((max, price) => (price > max ? price : max));
  if (highest === 0n) return "Free";
  if (lowest === 0n) return `Free to ${formatPrice(highest)}`;
  return `From ${formatPrice(lowest)}`;
}

/** "FT UGM, Sleman", from whichever of the venue and city the document has. */
export function placeLine(document: EventMetadata | null): string | null {
  const name = document?.location?.name?.trim();
  const city = document?.location?.city?.trim();
  if (name && city) return normalise(name).includes(normalise(city)) ? name : `${name}, ${city}`;
  return name || city || null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter fe exec vitest run test/browse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add fe/src/modules/directory/browse.ts fe/test/browse.test.ts
git commit -F - <<'EOF'
fe: decide featured races, area, search, order and card text in one place

Each rule the new directory turns on is a plain function, so it can be
tested without rendering the page. The featured row only takes races that
can be entered and have a poster, and the area matches by province because
neighbouring cities belong to the same visitor.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01282Bg6Fch4Zhxtjz1yDHJ4
EOF
```

---

### Task 5: Filter model (`filters.ts`)

**Files:**
- Create: `fe/src/modules/directory/filters.ts`
- Test: `fe/test/filters.test.ts`

**Interfaces:**
- Consumes: `DirectoryEntry` (Task 4), `STROOPS_PER_UNIT` from `@sterunxyz/sdk`.
- Produces:
  - `type PriceBucketId = "free" | "under-25" | "25-50" | "50-100" | "100-up"`
  - `type DistanceBucketId = "5k" | "10k" | "21k" | "over-21k"`
  - `PRICE_BUCKETS`, `DISTANCE_BUCKETS`: `readonly { id; label: string; matches(value): boolean }[]`
  - `interface Filters { locations: string[]; prices: PriceBucketId[]; distances: DistanceBucketId[]; openOnly: boolean }`, `NO_FILTERS`
  - `activeFilterCount(filters): number`, `locationKey(entry): string | null` (`"ID|DI Yogyakarta"`), `matchesFilters(entry, filters): boolean`
  - `interface LocationGroup { countryCode: string; country: string; options: { key: string; province: string; count: number }[] }`, `locationGroups(entries, preferredCountry?: string): LocationGroup[]`
  - `interface FilterChip { id: string; label: string; remove(filters: Filters): Filters }`, `filterChips(filters): FilterChip[]`

- [ ] **Step 1: Write the failing test**

`fe/test/filters.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  DISTANCE_BUCKETS,
  NO_FILTERS,
  PRICE_BUCKETS,
  activeFilterCount,
  filterChips,
  locationGroups,
  matchesFilters,
  type DistanceBucketId,
  type PriceBucketId,
} from "@/modules/directory/filters";

import { SUSD, category, entry, metadata, summary } from "./fixtures/directory";

function priceBucket(id: PriceBucketId) {
  const bucket = PRICE_BUCKETS.find((item) => item.id === id);
  if (!bucket) throw new Error(`no price bucket ${id}`);
  return bucket;
}

function distanceBucket(id: DistanceBucketId) {
  const bucket = DISTANCE_BUCKETS.find((item) => item.id === id);
  if (!bucket) throw new Error(`no distance bucket ${id}`);
  return bucket;
}

const JAKARTA = { name: "GBK", city: "Jakarta Pusat", province: "DKI Jakarta", country: "Indonesia", countryCode: "ID" };
const SELANGOR = { name: "Shah Alam", city: "Shah Alam", province: "Selangor", country: "Malaysia", countryCode: "MY" };

describe("PRICE_BUCKETS", () => {
  it.each([
    ["free", 0n, true],
    ["free", 1n, false],
    ["under-25", 1n, true],
    ["under-25", 25n * SUSD - 1n, true],
    ["under-25", 25n * SUSD, false],
    ["25-50", 25n * SUSD, true],
    ["25-50", 50n * SUSD, false],
    ["50-100", 50n * SUSD, true],
    ["50-100", 100n * SUSD, false],
    ["100-up", 100n * SUSD, true],
  ] as const)("%s holds %s stroops: %s", (id, price, expected) => {
    expect(priceBucket(id).matches(price)).toBe(expected);
  });

  it("puts every price in exactly one bucket", () => {
    for (const price of [0n, 1n, 24n * SUSD, 25n * SUSD, 49n * SUSD, 50n * SUSD, 99n * SUSD, 100n * SUSD, 900n * SUSD]) {
      expect(PRICE_BUCKETS.filter((bucket) => bucket.matches(price))).toHaveLength(1);
    }
  });

  it("labels buckets without a dash", () => {
    for (const bucket of [...PRICE_BUCKETS, ...DISTANCE_BUCKETS]) {
      expect(bucket.label).not.toMatch(/[—–]/);
    }
  });
});

describe("DISTANCE_BUCKETS", () => {
  it.each([
    ["5k", 5_000, true],
    ["5k", 5_001, false],
    ["10k", 5_001, true],
    ["10k", 10_000, true],
    ["21k", 10_001, true],
    ["21k", 21_097, true],
    ["21k", 21_100, true],
    ["over-21k", 21_101, true],
    ["over-21k", 42_195, true],
  ] as const)("%s holds %s m: %s", (id, metres, expected) => {
    expect(distanceBucket(id).matches(metres)).toBe(expected);
  });

  it("puts every distance in exactly one bucket", () => {
    for (const metres of [1_000, 5_000, 7_000, 10_000, 15_000, 21_098, 30_000, 42_195]) {
      expect(DISTANCE_BUCKETS.filter((bucket) => bucket.matches(metres))).toHaveLength(1);
    }
  });
});

describe("matchesFilters", () => {
  const free = entry(summary(1, {}, [category(0, { priceStroops: 0n })]), metadata());
  const pricey = entry(summary(2, {}, [category(0, { priceStroops: 120n * SUSD })]), metadata({ location: JAKARTA }));
  const closed = entry(summary(3, { status: "Closed" }, [category(0, { priceStroops: 0n })]), metadata());

  it("lets everything through with no filters", () => {
    expect([free, pricey, closed].every((race) => matchesFilters(race, NO_FILTERS))).toBe(true);
  });

  it("keeps only races open for entry", () => {
    expect(matchesFilters(closed, { ...NO_FILTERS, openOnly: true })).toBe(false);
    expect(matchesFilters(free, { ...NO_FILTERS, openOnly: true })).toBe(true);
  });

  it("keeps only races in a selected province", () => {
    const filters = { ...NO_FILTERS, locations: ["ID|DKI Jakarta"] };

    expect(matchesFilters(pricey, filters)).toBe(true);
    expect(matchesFilters(free, filters)).toBe(false);
  });

  it("leaves out a race without a location once a location is selected", () => {
    const unplaced = entry(summary(4, {}, [category(0)]), null);

    expect(matchesFilters(unplaced, { ...NO_FILTERS, locations: ["ID|DKI Jakarta"] })).toBe(false);
    expect(matchesFilters(unplaced, NO_FILTERS)).toBe(true);
  });

  it("treats options in one group as either-or", () => {
    const filters = { ...NO_FILTERS, prices: ["free", "100-up"] as PriceBucketId[] };

    expect(matchesFilters(free, filters)).toBe(true);
    expect(matchesFilters(pricey, filters)).toBe(true);
  });

  it("requires every group to hold", () => {
    expect(matchesFilters(closed, { ...NO_FILTERS, prices: ["free"], openOnly: true })).toBe(false);
  });

  it("judges price and distance on the same distance", () => {
    // A free 5K and a sUSD 60 marathon is not a free marathon.
    const mixed = entry(
      summary(5, {}, [
        category(0, { distanceM: 5_000, priceStroops: 0n }),
        category(1, { distanceM: 42_195, priceStroops: 60n * SUSD }),
      ]),
      metadata(),
    );

    expect(matchesFilters(mixed, { ...NO_FILTERS, prices: ["free"], distances: ["over-21k"] })).toBe(false);
    expect(matchesFilters(mixed, { ...NO_FILTERS, prices: ["50-100"], distances: ["over-21k"] })).toBe(true);
  });

  it("leaves out a race without distances once price or distance is filtered", () => {
    const bare = entry(summary(6), metadata());

    expect(matchesFilters(bare, { ...NO_FILTERS, prices: ["free"] })).toBe(false);
  });
});

describe("activeFilterCount", () => {
  it("counts every selected option and the open-only switch", () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(
      activeFilterCount({ locations: ["ID|Bali"], prices: ["free", "under-25"], distances: ["5k"], openOnly: true }),
    ).toBe(5);
  });
});

describe("locationGroups", () => {
  const yogyaA = entry(summary(1), metadata());
  const yogyaB = entry(summary(2), metadata());
  const jakarta = entry(summary(3), metadata({ location: JAKARTA }));
  const selangor = entry(summary(4), metadata({ location: SELANGOR }));
  const unplaced = entry(summary(5), null);

  it("lists provinces that have races, with how many, most first", () => {
    const [indonesia] = locationGroups([jakarta, yogyaA, yogyaB, unplaced]);

    expect(indonesia).toEqual({
      countryCode: "ID",
      country: "Indonesia",
      options: [
        { key: "ID|DI Yogyakarta", province: "DI Yogyakarta", count: 2 },
        { key: "ID|DKI Jakarta", province: "DKI Jakarta", count: 1 },
      ],
    });
  });

  it("puts the country with the most races first", () => {
    expect(locationGroups([selangor, yogyaA, yogyaB]).map((group) => group.countryCode)).toEqual(["ID", "MY"]);
  });

  it("puts the visitor's own country first", () => {
    expect(locationGroups([selangor, yogyaA, yogyaB], "MY").map((group) => group.countryCode)).toEqual(["MY", "ID"]);
  });

  it("is empty when no race has a location", () => {
    expect(locationGroups([unplaced])).toEqual([]);
  });
});

describe("filterChips", () => {
  const applied = {
    locations: ["ID|DI Yogyakarta"],
    prices: ["free"] as PriceBucketId[],
    distances: ["over-21k"] as DistanceBucketId[],
    openOnly: true,
  };

  it("names every applied filter", () => {
    expect(filterChips(applied).map((chip) => chip.label)).toEqual([
      "DI Yogyakarta",
      "Free",
      "Over 21K",
      "Open for entry only",
    ]);
  });

  it("removes only the filter it belongs to", () => {
    const [location, price, distance, open] = filterChips(applied);

    expect(location?.remove(applied).locations).toEqual([]);
    expect(price?.remove(applied)).toEqual({ ...applied, prices: [] });
    expect(distance?.remove(applied).distances).toEqual([]);
    expect(open?.remove(applied).openOnly).toBe(false);
  });

  it("has no chips when nothing is applied", () => {
    expect(filterChips(NO_FILTERS)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter fe exec vitest run test/filters.test.ts`
Expected: FAIL — cannot resolve `@/modules/directory/filters`.

- [ ] **Step 3: Implement**

`fe/src/modules/directory/filters.ts`:

```ts
/**
 * The filter drawer's model: the buckets, what each matches, the location
 * options, and the chips that show what is applied.
 *
 * Price and distance are judged on the same distance, never on the race as a
 * whole. A race with a free 5K and a sUSD 60 marathon is not "a free marathon",
 * and checking the two filters separately would say it is.
 */
import { STROOPS_PER_UNIT } from "@sterunxyz/sdk";

import type { DirectoryEntry } from "./browse";

export type PriceBucketId = "free" | "under-25" | "25-50" | "50-100" | "100-up";
export type DistanceBucketId = "5k" | "10k" | "21k" | "over-21k";

interface Bucket<Id extends string, Value> {
  id: Id;
  label: string;
  matches: (value: Value) => boolean;
}

const UNIT = STROOPS_PER_UNIT;

/**
 * Lower bound inclusive, upper bound exclusive: a sUSD 50 race is in "sUSD 50
 * to 100". Fixed buckets rather than a slider, because across a few dozen races
 * a slider mostly lands on empty ranges. Testnet prices run from free to sUSD
 * 50; retune these here once mainnet prices are known.
 */
export const PRICE_BUCKETS: readonly Bucket<PriceBucketId, bigint>[] = [
  { id: "free", label: "Free", matches: (price) => price === 0n },
  { id: "under-25", label: "Under sUSD 25", matches: (price) => price > 0n && price < 25n * UNIT },
  { id: "25-50", label: "sUSD 25 to 50", matches: (price) => price >= 25n * UNIT && price < 50n * UNIT },
  { id: "50-100", label: "sUSD 50 to 100", matches: (price) => price >= 50n * UNIT && price < 100n * UNIT },
  { id: "100-up", label: "sUSD 100 and up", matches: (price) => price >= 100n * UNIT },
];

/**
 * A half marathon is 21,097.5 m and gets typed as 21097, 21098 or 21100, so the
 * boundary sits at 21,100 to keep every spelling of it in "11K to 21K".
 */
const HALF_MARATHON_M = 21_100;

export const DISTANCE_BUCKETS: readonly Bucket<DistanceBucketId, number>[] = [
  { id: "5k", label: "5K and under", matches: (metres) => metres <= 5_000 },
  { id: "10k", label: "6K to 10K", matches: (metres) => metres > 5_000 && metres <= 10_000 },
  { id: "21k", label: "11K to 21K", matches: (metres) => metres > 10_000 && metres <= HALF_MARATHON_M },
  { id: "over-21k", label: "Over 21K", matches: (metres) => metres > HALF_MARATHON_M },
];

export interface Filters {
  /** Location keys, `${countryCode}|${province}`. */
  locations: string[];
  prices: PriceBucketId[];
  distances: DistanceBucketId[];
  openOnly: boolean;
}

export const NO_FILTERS: Filters = { locations: [], prices: [], distances: [], openOnly: false };

export function activeFilterCount(filters: Filters): number {
  return (
    filters.locations.length +
    filters.prices.length +
    filters.distances.length +
    (filters.openOnly ? 1 : 0)
  );
}

/** `"ID|DI Yogyakarta"`, or null for a race whose proven document names no province. */
export function locationKey(entry: DirectoryEntry): string | null {
  const location = entry.document?.location;
  const province = location?.province?.trim();
  if (!location?.countryCode || !province) return null;
  return `${location.countryCode}|${province}`;
}

/** Options within a group are either-or; groups must all hold. */
export function matchesFilters(entry: DirectoryEntry, filters: Filters): boolean {
  const { summary } = entry;
  if (filters.openOnly && summary.event.status !== "Open") return false;

  if (filters.locations.length > 0) {
    const key = locationKey(entry);
    if (key === null || !filters.locations.includes(key)) return false;
  }

  if (filters.prices.length === 0 && filters.distances.length === 0) return true;

  const prices = PRICE_BUCKETS.filter((bucket) => filters.prices.includes(bucket.id));
  const distances = DISTANCE_BUCKETS.filter((bucket) => filters.distances.includes(bucket.id));
  return summary.categories.some(
    (category) =>
      (prices.length === 0 || prices.some((bucket) => bucket.matches(category.priceStroops))) &&
      (distances.length === 0 || distances.some((bucket) => bucket.matches(category.distanceM))),
  );
}

export interface LocationOption {
  key: string;
  province: string;
  count: number;
}

export interface LocationGroup {
  countryCode: string;
  country: string;
  options: LocationOption[];
}

function totalOf(group: LocationGroup): number {
  return group.options.reduce((sum, option) => sum + option.count, 0);
}

/**
 * The provinces that have races, with how many, grouped by country.
 *
 * Built from the races themselves, so no option can lead to an empty list. The
 * visitor's own country comes first when they have chosen an area; otherwise
 * the country with the most races does. The country name is the document's
 * own, so the directory never loads the places dataset for it.
 */
export function locationGroups(
  entries: readonly DirectoryEntry[],
  preferredCountry?: string,
): LocationGroup[] {
  const byCountry = new Map<string, { country: string; counts: Map<string, number> }>();

  for (const item of entries) {
    const key = locationKey(item);
    const location = item.document?.location;
    if (key === null || !location?.countryCode) continue;
    const province = key.slice(location.countryCode.length + 1);
    const group = byCountry.get(location.countryCode) ?? {
      country: location.country?.trim() || location.countryCode,
      counts: new Map<string, number>(),
    };
    group.counts.set(province, (group.counts.get(province) ?? 0) + 1);
    byCountry.set(location.countryCode, group);
  }

  const groups: LocationGroup[] = [...byCountry.entries()].map(([countryCode, group]) => ({
    countryCode,
    country: group.country,
    options: [...group.counts.entries()]
      .map(([province, count]) => ({ key: `${countryCode}|${province}`, province, count }))
      .sort((a, b) => b.count - a.count || a.province.localeCompare(b.province)),
  }));

  return groups.sort((a, b) => {
    if (a.countryCode === preferredCountry) return -1;
    if (b.countryCode === preferredCountry) return 1;
    return totalOf(b) - totalOf(a) || a.country.localeCompare(b.country);
  });
}

export interface FilterChip {
  id: string;
  label: string;
  remove: (filters: Filters) => Filters;
}

export function filterChips(filters: Filters): FilterChip[] {
  return [
    ...filters.locations.map((key) => ({
      id: `location:${key}`,
      label: key.slice(key.indexOf("|") + 1),
      remove: (current: Filters) => ({ ...current, locations: current.locations.filter((item) => item !== key) }),
    })),
    ...filters.prices.map((id) => ({
      id: `price:${id}`,
      label: PRICE_BUCKETS.find((bucket) => bucket.id === id)?.label ?? id,
      remove: (current: Filters) => ({ ...current, prices: current.prices.filter((item) => item !== id) }),
    })),
    ...filters.distances.map((id) => ({
      id: `distance:${id}`,
      label: DISTANCE_BUCKETS.find((bucket) => bucket.id === id)?.label ?? id,
      remove: (current: Filters) => ({ ...current, distances: current.distances.filter((item) => item !== id) }),
    })),
    ...(filters.openOnly
      ? [{ id: "open-only", label: "Open for entry only", remove: (current: Filters) => ({ ...current, openOnly: false }) }]
      : []),
  ];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter fe exec vitest run test/filters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add fe/src/modules/directory/filters.ts fe/test/filters.test.ts
git commit -F - <<'EOF'
fe: model the directory filters: location, price, distance, open only

Locations are read from the races themselves with counts, so no option can
empty the list. Price and distance are checked on the same distance, so a
cheap 5K cannot make a race look like it has a cheap marathon.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01282Bg6Fch4Zhxtjz1yDHJ4
EOF
```

---

### Task 6: Poster frame and the new event card

**Files:**
- Create: `fe/src/modules/directory/component/PosterFrame.tsx`
- Rewrite: `fe/src/modules/directory/component/EventCard.tsx`
- Modify: `fe/src/modules/directory/Directory.tsx` (the card call only, so the page keeps compiling until Task 9)
- Modify: `fe/test/Directory.test.tsx` (four assertions whose copy changed)
- Test: `fe/test/PosterFrame.test.tsx`, `fe/test/EventCard.test.tsx`

**Interfaces:**
- Consumes: `DirectoryEntry`, `entriesLine`, `priceLine`, `placeLine` (Task 4).
- Produces:
  - `PosterFrame({ posterUrl: string | null; loading: boolean; sizes: string; className?: string; children?: ReactNode })`
  - `EventCard({ entry: DirectoryEntry; documentLoading: boolean; variant?: "grid" | "featured" | "side" })`

- [ ] **Step 1: Check the `next/image` API for this Next version**

Run: `ls fe/node_modules/next/dist/docs/ 2>/dev/null | head; grep -rl "fill" fe/node_modules/next/dist/docs 2>/dev/null | head -5`
Read the image component doc it lists. Confirm `fill`, `unoptimized`, `sizes`, `onLoad` and `onError` are still props. If `fe/node_modules/next` does not exist, use the root `node_modules/.pnpm/next@16.3.3*/node_modules/next/dist/docs/`.

- [ ] **Step 2: Write the failing tests**

`fe/test/PosterFrame.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PosterFrame } from "@/modules/directory/component/PosterFrame";

const POSTER = "https://files.test/poster.jpg";

describe("PosterFrame", () => {
  describe("positive", () => {
    it("shows the whole poster over a blurred copy of itself", () => {
      const { container } = render(<PosterFrame posterUrl={POSTER} loading={false} sizes="100vw" />);

      const images = container.querySelectorAll("img");
      expect(images).toHaveLength(2);
      images.forEach((image) => expect(image.getAttribute("src")).toBe(POSTER));
      expect(images[1]).toHaveClass("object-contain");
      expect(screen.queryByText("No image")).not.toBeInTheDocument();
    });

    it("draws what it is given on top of the picture", () => {
      render(
        <PosterFrame posterUrl={POSTER} loading={false} sizes="100vw">
          <span>Open</span>
        </PosterFrame>,
      );

      expect(screen.getByText("Open")).toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("stays blank while the document is on its way", () => {
      const { container } = render(<PosterFrame posterUrl={null} loading sizes="100vw" />);

      expect(container.querySelector("img")).toBeNull();
      expect(screen.queryByText("No image")).not.toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("says No image when the race has no poster", () => {
      render(<PosterFrame posterUrl={null} loading={false} sizes="100vw" />);

      expect(screen.getByText("No image")).toBeInTheDocument();
    });

    it("falls back to No image when the poster fails to load", () => {
      const { container } = render(<PosterFrame posterUrl={POSTER} loading={false} sizes="100vw" />);

      fireEvent.error(container.querySelectorAll("img")[1]);

      expect(screen.getByText("No image")).toBeInTheDocument();
      expect(container.querySelector("img")).toBeNull();
    });
  });
});
```

`fe/test/EventCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EventCard } from "@/modules/directory/component/EventCard";
import { formatEventDate } from "@/utils/format";

import { SUSD, category, entry, metadata, summary } from "./fixtures/directory";

describe("EventCard", () => {
  describe("positive", () => {
    it("links the whole card to the race", () => {
      render(<EventCard entry={entry(summary(7, {}, [category(0)]), metadata())} documentLoading={false} />);

      expect(screen.getByRole("link", { name: /Jakarta Marathon 7/ })).toHaveAttribute("href", "/events/7");
    });

    it("shows the venue, date, entries left, starting price and status", () => {
      const race = summary(7, {}, [
        category(0, { quota: 600, enteredCount: 100, priceStroops: 25n * SUSD }),
        category(1, { quota: 10, enteredCount: 10, priceStroops: 40n * SUSD }),
      ]);

      render(<EventCard entry={entry(race, metadata())} documentLoading={false} />);

      expect(screen.getByText("FT UGM, Sleman")).toBeInTheDocument();
      expect(screen.getByText(formatEventDate(race.event.startsAt))).toBeInTheDocument();
      expect(screen.getByText("500 entries left")).toBeInTheDocument();
      expect(screen.getByText("From sUSD 25")).toBeInTheDocument();
      expect(screen.getByText("Open")).toBeInTheDocument();
    });

    it("puts the poster in the frame", () => {
      const { container } = render(
        <EventCard entry={entry(summary(7, {}, [category(0)]), metadata())} documentLoading={false} />,
      );

      expect(container.querySelector("img")?.getAttribute("src")).toBe("https://files.test/poster.jpg");
    });

    it("sets a featured title in the hero face", () => {
      render(
        <EventCard entry={entry(summary(7, {}, [category(0)]), metadata())} documentLoading={false} variant="featured" />,
      );

      expect(screen.getByRole("heading", { name: "Jakarta Marathon 7" })).toHaveClass("heading-hero");
    });
  });

  describe("edge", () => {
    it("leaves the venue out and says No image when the document is not proven", () => {
      render(<EventCard entry={entry(summary(7, {}, [category(0)]), null)} documentLoading={false} />);

      expect(screen.queryByText("FT UGM, Sleman")).not.toBeInTheDocument();
      expect(screen.getByText("No image")).toBeInTheDocument();
    });

    it("says No distances yet for a race without categories", () => {
      render(<EventCard entry={entry(summary(7), metadata())} documentLoading={false} />);

      expect(screen.getByText("No distances yet")).toBeInTheDocument();
    });

    it("does not say No image while the document is loading", () => {
      render(<EventCard entry={entry(summary(7, {}, [category(0)]), null)} documentLoading />);

      expect(screen.queryByText("No image")).not.toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("does not count entries for a race that is not open", () => {
      render(
        <EventCard entry={entry(summary(7, { status: "Closed" }, [category(0)]), metadata())} documentLoading={false} />,
      );

      expect(screen.queryByText(/entries left/)).not.toBeInTheDocument();
      expect(screen.getByText("Closed")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter fe exec vitest run test/PosterFrame.test.tsx test/EventCard.test.tsx`
Expected: FAIL — `PosterFrame` not found; `EventCard` does not accept `entry`.

- [ ] **Step 4: Implement `PosterFrame`**

`fe/src/modules/directory/component/PosterFrame.tsx`:

```tsx
"use client";

/**
 * A race poster in a fixed 16:9 frame, whatever shape the poster is.
 *
 * Posters arrive in every shape (the ones on testnet today are 3:1, 4:3 and
 * about 10:7) and they carry their own title, date and venue as text. Cropping
 * one to fill the frame cuts that text off, so the poster is always shown
 * whole, and the space it leaves is filled with a blurred, dimmed copy of the
 * same picture. A 16:9 poster, which the wizard recommends, fills the frame
 * exactly and the copy never shows.
 *
 * The blur stays at 16px: heavy blur is expensive to paint, worst in Safari.
 */
import { ImageOffIcon } from "lucide-react";
import Image from "next/image";
import { useState, type ReactNode } from "react";

import { cn } from "@/utils/cn";

interface PosterFrameProps {
  posterUrl: string | null;
  /** The document is still on its way, so whether there is a poster is not known yet. */
  loading: boolean;
  sizes: string;
  className?: string;
  /** Drawn over the picture, e.g. the status badge. */
  children?: ReactNode;
}

export function PosterFrame({ posterUrl, loading, sizes, className, children }: PosterFrameProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const showPoster = posterUrl !== null && failedUrl !== posterUrl;

  return (
    <div className={cn("relative aspect-video w-full overflow-hidden bg-n-100", className)}>
      {showPoster ? (
        <>
          <Image
            src={posterUrl}
            alt=""
            aria-hidden
            fill
            unoptimized
            sizes={sizes}
            className="scale-125 object-cover blur-lg"
          />
          <div aria-hidden className="absolute inset-0 bg-ink/40" />
          <Image
            src={posterUrl}
            alt=""
            fill
            unoptimized
            sizes={sizes}
            onLoad={() => setLoadedUrl(posterUrl)}
            onError={() => setFailedUrl(posterUrl)}
            className={cn(
              "object-contain transition-opacity duration-200 ease-out motion-reduce:transition-none",
              loadedUrl === posterUrl ? "opacity-100" : "opacity-0",
            )}
          />
        </>
      ) : null}

      {!showPoster && !loading ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-n-500">
          <ImageOffIcon aria-hidden className="size-6" />
          <span className="text-sm">No image</span>
        </div>
      ) : null}

      {children}
    </div>
  );
}
```

Note: jsdom never fires `load`, so in tests the front image stays at `opacity-0`; the assertions only check presence.

- [ ] **Step 5: Implement the card**

Replace the whole of `fe/src/modules/directory/component/EventCard.tsx` with:

```tsx
/**
 * One race in the directory, led by its poster.
 *
 * The whole card is one link to the event page. Entry is per category and
 * always has been (WEB_APP_IA.md §3.1), so there is no enter button to put here:
 * the card owes a visitor enough to decide whether to open the race, which is
 * where it is, when it is, whether there is room, and what it costs.
 *
 * Three sizes share one card so the featured row and the grid cannot drift
 * apart. Only the featured card sets its title in the hero face, because Big
 * Shoulders is only used at 48px and above (tokens.css).
 */
import { CalendarDaysIcon, MapPinIcon, TicketIcon } from "lucide-react";
import Link from "next/link";

import { EventStatusBadge } from "@/components/elements/EventStatusBadge";
import { cn } from "@/utils/cn";
import { formatEventDate } from "@/utils/format";

import { entriesLine, placeLine, priceLine, type DirectoryEntry } from "../browse";
import { PosterFrame } from "./PosterFrame";

export type EventCardVariant = "grid" | "featured" | "side";

const SIZES: Record<EventCardVariant, string> = {
  grid: "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  featured: "(min-width: 1024px) 66vw, 100vw",
  side: "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
};

interface EventCardProps {
  entry: DirectoryEntry;
  documentLoading: boolean;
  variant?: EventCardVariant;
}

export function EventCard({ entry, documentLoading, variant = "grid" }: EventCardProps) {
  const { event, categories } = entry.summary;
  const place = variant === "side" ? null : placeLine(entry.document);
  const entries = entriesLine(entry.summary);
  const price = variant === "side" ? null : priceLine(categories);
  const featured = variant === "featured";

  return (
    <Link
      href={`/events/${event.eventId}`}
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-lg border border-n-200 bg-paper shadow-card",
        "transition-[box-shadow,transform] duration-150 ease-out hover:shadow-lifted active:scale-[0.98]",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
      )}
    >
      <PosterFrame
        posterUrl={entry.document?.posterUrl ?? null}
        loading={documentLoading}
        sizes={SIZES[variant]}
      >
        <div className="absolute top-3 right-3">
          <EventStatusBadge status={event.status} />
        </div>
      </PosterFrame>

      <div className={cn("flex flex-1 flex-col gap-3", featured ? "p-6" : "p-4")}>
        <h3
          className={cn(
            "text-ink",
            featured ? "heading-hero text-4xl" : "heading-strong line-clamp-2 text-xl",
          )}
        >
          {event.name}
        </h3>

        <ul className="flex flex-col gap-1.5 text-sm text-n-600">
          {place ? (
            <li className="flex items-center gap-2">
              <MapPinIcon aria-hidden className="size-4 shrink-0 text-n-500" />
              <span className="truncate">{place}</span>
            </li>
          ) : null}
          <li className="flex items-center gap-2">
            <CalendarDaysIcon aria-hidden className="size-4 shrink-0 text-n-500" />
            <span className="numeric">{formatEventDate(event.startsAt)}</span>
          </li>
          {entries ? (
            <li className="flex items-center gap-2">
              <TicketIcon aria-hidden className="size-4 shrink-0 text-n-500" />
              <span className="numeric">{entries}</span>
            </li>
          ) : null}
          {categories.length === 0 ? <li>No distances yet</li> : null}
        </ul>

        {price ? <p className="numeric mt-auto pt-1 text-base font-medium text-ink">{price}</p> : null}
      </div>
    </Link>
  );
}
```

- [ ] **Step 6: Keep the current page compiling**

In `fe/src/modules/directory/Directory.tsx`, replace:

```tsx
            <EventCard key={summary.event.eventId} summary={summary} />
```

with:

```tsx
            <EventCard
              key={summary.event.eventId}
              entry={{ summary, document: null }}
              documentLoading={false}
            />
```

In `fe/test/Directory.test.tsx`:
- In "summarises the categories on the card", replace the two expectations with `expect(await screen.findByText("From sUSD 25")).toBeInTheDocument();` and rename the test to `"shows the starting price on the card"`.
- In "counts the places left across an event's categories", change `"150 places left"` to `"150 entries left"`.
- In "says one place, not one places", change `"1 place left"` to `"1 entry left"`.
- In "shows an event that has no categories yet", change `/no categories/i` to `"No distances yet"`.

- [ ] **Step 7: Run to verify they pass**

Run: `pnpm --filter fe exec vitest run test/PosterFrame.test.tsx test/EventCard.test.tsx test/Directory.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add fe/src/modules/directory/component/PosterFrame.tsx fe/src/modules/directory/component/EventCard.tsx fe/src/modules/directory/Directory.tsx fe/test/PosterFrame.test.tsx fe/test/EventCard.test.tsx fe/test/Directory.test.tsx
git commit -F - <<'EOF'
fe: lead each directory card with its poster

Posters come in every shape and carry their own text, so the frame is a
fixed 16:9 that shows the poster whole over a blurred copy of itself rather
than cropping the date off. A race without a proven poster says No image,
so a missing picture reads as missing, not broken.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01282Bg6Fch4Zhxtjz1yDHJ4
EOF
```

---

### Task 7: Filter drawer and filter chips

**Files:**
- Generate: `fe/src/components/ui/sheet.tsx`, `fe/src/components/ui/radio-group.tsx`
- Create: `fe/src/modules/directory/component/FilterDrawer.tsx`, `fe/src/modules/directory/component/FilterChips.tsx`
- Test: `fe/test/FilterDrawer.test.tsx`, `fe/test/FilterChips.test.tsx`

**Interfaces:**
- Consumes: `DirectoryEntry`, `DateOrder` (Task 4); `Filters`, `NO_FILTERS`, `PRICE_BUCKETS`, `DISTANCE_BUCKETS`, `activeFilterCount`, `locationGroups`, `matchesFilters`, `filterChips` (Task 5); `useMediaQuery` (Task 3).
- Produces:
  - `FilterDrawer({ entries: readonly DirectoryEntry[]; filters: Filters; order: DateOrder; preferredCountry?: string; onApply: (filters: Filters, order: DateOrder) => void })`
  - `FilterChips({ filters: Filters; onChange: (filters: Filters) => void; onClear: () => void })`

- [ ] **Step 1: Add the shadcn components**

```bash
cd fe && pnpm dlx shadcn@latest add sheet radio-group --yes && cd ..
sed -i 's|from "cn"|from "@/utils/cn"|' fe/src/components/ui/*.tsx
git status --short
```

Expected: two new files under `fe/src/components/ui/`. If `fe/package.json` or `pnpm-lock.yaml` changed, check the diff: `radix-ui` and `lucide-react` are already dependencies, so revert any change that only re-adds them (`git checkout -- fe/package.json pnpm-lock.yaml`). If the CLI created `fe/package-lock.json` or `fe/pnpm-lock.yaml`, delete it (fe/CLAUDE.md: only the root lockfile applies).

Open `fe/src/components/ui/sheet.tsx` and confirm it exports `Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription` and that `SheetContent` takes `side?: "top" | "right" | "bottom" | "left"`. Confirm `radio-group.tsx` exports `RadioGroup, RadioGroupItem`, and that neither file imports `@radix-ui/react-*` (it must be `radix-ui`).

Run: `pnpm --filter fe typecheck`
Expected: no errors.

- [ ] **Step 2: Write the failing tests**

`fe/test/FilterDrawer.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { FilterDrawer } from "@/modules/directory/component/FilterDrawer";
import { NO_FILTERS } from "@/modules/directory/filters";

import { SUSD, category, entry, metadata, summary } from "./fixtures/directory";

const FREE = entry(summary(0, { name: "Free Fun Run" }, [category(0, { priceStroops: 0n })]), metadata());
const PAID = entry(summary(1, { name: "Paid Road Race" }, [category(0, { priceStroops: 25n * SUSD })]), metadata());
const JAKARTA = entry(
  summary(2, {}, [category(0)]),
  metadata({ location: { name: "GBK", city: "Jakarta Pusat", province: "DKI Jakarta", country: "Indonesia", countryCode: "ID" } }),
);

function renderDrawer(props: Partial<ComponentProps<typeof FilterDrawer>> = {}) {
  const onApply = vi.fn();
  render(<FilterDrawer entries={[FREE, PAID]} filters={NO_FILTERS} order="soonest" onApply={onApply} {...props} />);
  return { onApply };
}

async function openDrawer(name: string | RegExp = "Filters") {
  await userEvent.click(screen.getByRole("button", { name }));
}

describe("FilterDrawer", () => {
  describe("positive", () => {
    it("counts the races an option leaves, then applies it", async () => {
      const { onApply } = renderDrawer();
      await openDrawer();

      await userEvent.click(await screen.findByRole("checkbox", { name: "Free" }));
      await userEvent.click(screen.getByRole("button", { name: "Show 1 race" }));

      expect(onApply).toHaveBeenCalledWith({ ...NO_FILTERS, prices: ["free"] }, "soonest");
    });

    it("lists only provinces that have races, with how many", async () => {
      renderDrawer({ entries: [FREE, PAID, JAKARTA] });
      await openDrawer();

      expect(await screen.findByRole("checkbox", { name: "DI Yogyakarta (2)" })).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: "DKI Jakarta (1)" })).toBeInTheDocument();
    });

    it("applies the date order", async () => {
      const { onApply } = renderDrawer();
      await openDrawer();

      await userEvent.click(await screen.findByRole("radio", { name: "Latest first" }));
      await userEvent.click(screen.getByRole("button", { name: "Show 2 races" }));

      expect(onApply).toHaveBeenCalledWith(NO_FILTERS, "latest");
    });

    it("says how many filters are applied on the button", () => {
      renderDrawer({ filters: { ...NO_FILTERS, prices: ["free"], openOnly: true } });

      expect(screen.getByRole("button", { name: "Filters, 2 applied" })).toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("discards changes that were not applied", async () => {
      const { onApply } = renderDrawer();
      await openDrawer();
      await userEvent.click(await screen.findByRole("checkbox", { name: "Free" }));

      await userEvent.keyboard("{Escape}");
      await openDrawer();

      expect(onApply).not.toHaveBeenCalled();
      expect(await screen.findByRole("checkbox", { name: "Free" })).not.toBeChecked();
    });

    it("clears every option at once", async () => {
      renderDrawer({ filters: { ...NO_FILTERS, prices: ["free"] } });
      await openDrawer("Filters, 1 applied");
      expect(await screen.findByRole("checkbox", { name: "Free" })).toBeChecked();

      await userEvent.click(screen.getByRole("button", { name: "Clear all" }));

      expect(screen.getByRole("checkbox", { name: "Free" })).not.toBeChecked();
      expect(screen.getByRole("button", { name: "Show 2 races" })).toBeInTheDocument();
    });

    it("hides the location group when no race has a location", async () => {
      renderDrawer({ entries: [entry(summary(3, {}, [category(0)]), null)] });
      await openDrawer();

      await screen.findByRole("checkbox", { name: "Free" });
      expect(screen.queryByText("Location")).not.toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("says so when nothing fits", async () => {
      renderDrawer();
      await openDrawer();

      await userEvent.click(await screen.findByRole("checkbox", { name: "sUSD 100 and up" }));

      expect(screen.getByRole("button", { name: "Show 0 races" })).toBeInTheDocument();
    });
  });
});
```

`fe/test/FilterChips.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FilterChips } from "@/modules/directory/component/FilterChips";
import { NO_FILTERS } from "@/modules/directory/filters";

describe("FilterChips", () => {
  it("removes one filter from its chip", async () => {
    const onChange = vi.fn();
    const filters = { ...NO_FILTERS, prices: ["free" as const], openOnly: true };
    render(<FilterChips filters={filters} onChange={onChange} onClear={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Remove Free" }));

    expect(onChange).toHaveBeenCalledWith({ ...filters, prices: [] });
  });

  it("clears them all", async () => {
    const onClear = vi.fn();
    render(<FilterChips filters={{ ...NO_FILTERS, openOnly: true }} onChange={vi.fn()} onClear={onClear} />);

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(onClear).toHaveBeenCalled();
  });

  it("renders nothing when no filter is applied", () => {
    const { container } = render(<FilterChips filters={NO_FILTERS} onChange={vi.fn()} onClear={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter fe exec vitest run test/FilterDrawer.test.tsx test/FilterChips.test.tsx`
Expected: FAIL — components not found.

- [ ] **Step 4: Implement the drawer**

`fe/src/modules/directory/component/FilterDrawer.tsx`:

```tsx
"use client";

/**
 * The directory's filters, in a drawer.
 *
 * Changes are staged: nothing moves on the page while options are being
 * ticked, and the button at the bottom says how many races the current choice
 * leaves before it is applied. Closing any other way throws the choice away,
 * so a drawer dismissed by accident never changes what is listed.
 *
 * It slides in from the right on a wide screen and up from the bottom on a
 * phone, where a side panel would cover the whole screen anyway.
 */
import { SlidersHorizontalIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/useMediaQuery";

import type { DateOrder, DirectoryEntry } from "../browse";
import {
  DISTANCE_BUCKETS,
  NO_FILTERS,
  PRICE_BUCKETS,
  activeFilterCount,
  locationGroups,
  matchesFilters,
  type Filters,
} from "../filters";

const ORDERS: { value: DateOrder; label: string }[] = [
  { value: "soonest", label: "Soonest first" },
  { value: "latest", label: "Latest first" },
];

interface FilterDrawerProps {
  /** The races the search left. The options and the live count are built from these. */
  entries: readonly DirectoryEntry[];
  filters: Filters;
  order: DateOrder;
  /** The country of the visitor's chosen area, listed first under Location. */
  preferredCountry?: string;
  onApply: (filters: Filters, order: DateOrder) => void;
}

function toggle<T>(list: readonly T[], value: T, on: boolean): T[] {
  return on ? [...list, value] : list.filter((item) => item !== value);
}

export function FilterDrawer({ entries, filters, order, preferredCountry, onApply }: FilterDrawerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const [draftOrder, setDraftOrder] = useState(order);
  const wide = useMediaQuery("(min-width: 640px)");

  const applied = activeFilterCount(filters);
  const count = entries.filter((item) => matchesFilters(item, draft)).length;
  const groups = locationGroups(entries, preferredCountry);

  function onOpenChange(next: boolean) {
    // Every opening starts from what is applied, never from a choice abandoned last time.
    if (next) {
      setDraft(filters);
      setDraftOrder(order);
    }
    setOpen(next);
  }

  function apply() {
    onApply(draft, draftOrder);
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" aria-label={applied > 0 ? `Filters, ${applied} applied` : "Filters"}>
          <SlidersHorizontalIcon aria-hidden />
          <span className="hidden sm:inline">Filters</span>
          {applied > 0 ? (
            <span aria-hidden className="numeric rounded-sm bg-teal-50 px-1.5 text-xs text-teal-700">
              {applied}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>

      <SheetContent
        side={wide ? "right" : "bottom"}
        className={wide ? "w-full sm:max-w-sm" : "max-h-[85vh] rounded-t-xl"}
      >
        <SheetHeader>
          <SheetTitle className="heading-strong text-xl text-ink">Filter races</SheetTitle>
          <SheetDescription>Pick what matters, then show the races that fit.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-2">
          <fieldset className="flex flex-col gap-3">
            <legend className="heading mb-3 text-base text-ink">Race date</legend>
            <RadioGroup
              aria-label="Race date"
              value={draftOrder}
              onValueChange={(value) => setDraftOrder(value as DateOrder)}
            >
              {ORDERS.map((option) => (
                <div key={option.value} className="flex items-center gap-3">
                  <RadioGroupItem id={`filter-order-${option.value}`} value={option.value} />
                  <Label htmlFor={`filter-order-${option.value}`}>{option.label}</Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>

          {groups.length > 0 ? (
            <fieldset className="flex flex-col gap-3">
              <legend className="heading mb-3 text-base text-ink">Location</legend>
              {groups.map((group, groupIndex) => (
                <div key={group.countryCode} className="flex flex-col gap-3">
                  {groups.length > 1 ? <p className="text-sm text-n-500">{group.country}</p> : null}
                  {group.options.map((option, optionIndex) => {
                    const id = `filter-location-${groupIndex}-${optionIndex}`;
                    return (
                      <div key={option.key} className="flex items-center gap-3">
                        <Checkbox
                          id={id}
                          checked={draft.locations.includes(option.key)}
                          onCheckedChange={(checked) =>
                            setDraft({ ...draft, locations: toggle(draft.locations, option.key, checked === true) })
                          }
                        />
                        <Label htmlFor={id}>
                          {option.province}
                          <span className="numeric text-n-500"> ({option.count})</span>
                        </Label>
                      </div>
                    );
                  })}
                </div>
              ))}
            </fieldset>
          ) : null}

          <fieldset className="flex flex-col gap-3">
            <legend className="heading mb-3 text-base text-ink">Price</legend>
            {PRICE_BUCKETS.map((bucket) => (
              <div key={bucket.id} className="flex items-center gap-3">
                <Checkbox
                  id={`filter-price-${bucket.id}`}
                  checked={draft.prices.includes(bucket.id)}
                  onCheckedChange={(checked) =>
                    setDraft({ ...draft, prices: toggle(draft.prices, bucket.id, checked === true) })
                  }
                />
                <Label htmlFor={`filter-price-${bucket.id}`}>{bucket.label}</Label>
              </div>
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="heading mb-3 text-base text-ink">Distance</legend>
            {DISTANCE_BUCKETS.map((bucket) => (
              <div key={bucket.id} className="flex items-center gap-3">
                <Checkbox
                  id={`filter-distance-${bucket.id}`}
                  checked={draft.distances.includes(bucket.id)}
                  onCheckedChange={(checked) =>
                    setDraft({ ...draft, distances: toggle(draft.distances, bucket.id, checked === true) })
                  }
                />
                <Label htmlFor={`filter-distance-${bucket.id}`}>{bucket.label}</Label>
              </div>
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="heading mb-3 text-base text-ink">Availability</legend>
            <div className="flex items-center gap-3">
              <Checkbox
                id="filter-open-only"
                checked={draft.openOnly}
                onCheckedChange={(checked) => setDraft({ ...draft, openOnly: checked === true })}
              />
              <Label htmlFor="filter-open-only">Open for entry only</Label>
            </div>
          </fieldset>
        </div>

        <SheetFooter className="flex-row justify-between gap-3 border-t border-n-200">
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(NO_FILTERS);
              setDraftOrder("soonest");
            }}
          >
            Clear all
          </Button>
          <Button onClick={apply}>{`Show ${count} ${count === 1 ? "race" : "races"}`}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 5: Implement the chips**

`fe/src/modules/directory/component/FilterChips.tsx`:

```tsx
/**
 * What is filtered, visible without opening the drawer, and removable one at a
 * time. A filtered list that does not say it is filtered reads as a directory
 * with fewer races in it.
 */
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

import { filterChips, type Filters } from "../filters";

interface FilterChipsProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  onClear: () => void;
}

export function FilterChips({ filters, onChange, onClear }: FilterChipsProps) {
  const chips = filterChips(filters);
  if (chips.length === 0) return null;

  return (
    <ul aria-label="Applied filters" className="flex flex-wrap items-center justify-center gap-2">
      {chips.map((chip) => (
        <li key={chip.id}>
          <Button
            variant="secondary"
            size="sm"
            aria-label={`Remove ${chip.label}`}
            onClick={() => onChange(chip.remove(filters))}
          >
            {chip.label}
            <XIcon aria-hidden />
          </Button>
        </li>
      ))}
      <li>
        <Button variant="link" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      </li>
    </ul>
  );
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `pnpm --filter fe exec vitest run test/FilterDrawer.test.tsx test/FilterChips.test.tsx`
Expected: PASS. If a Radix checkbox's accessible name does not include the count text, check that `Label` renders a `<label htmlFor>` and the count `<span>` is inside it.

- [ ] **Step 7: Commit**

```bash
git add fe/src/components/ui/sheet.tsx fe/src/components/ui/radio-group.tsx fe/src/modules/directory/component/FilterDrawer.tsx fe/src/modules/directory/component/FilterChips.tsx fe/test/FilterDrawer.test.tsx fe/test/FilterChips.test.tsx
git commit -F - <<'EOF'
fe: filter the directory from a drawer, and show what is applied

Choices are staged and the apply button counts the races they leave, so
ticking options never reshuffles the page underneath. Applied filters stay
visible as chips, because a filtered list that does not say so reads as a
directory with fewer races.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01282Bg6Fch4Zhxtjz1yDHJ4
EOF
```

---

### Task 8: Area picker and featured row

**Files:**
- Create: `fe/src/modules/directory/component/AreaPicker.tsx`, `fe/src/modules/directory/component/AreaForm.tsx`, `fe/src/modules/directory/component/FeaturedEvents.tsx`
- Test: `fe/test/AreaPicker.test.tsx`, `fe/test/FeaturedEvents.test.tsx`

**Interfaces:**
- Consumes: `Area` (Task 3), `EventCard` (Task 6), `DirectoryEntry` (Task 4), `SearchableSelect` from `@/components/elements/SearchableSelect`, `countries`/`countryName`/`provincesOf` from `@/lib/places`.
- Produces:
  - `AreaPicker({ area: Area | null; onSave: (area: Area) => void; onClear: () => void })`
  - `FeaturedEvents({ entries: readonly DirectoryEntry[] })`, rendering `<section aria-label="Featured races">` or nothing.

- [ ] **Step 1: Write the failing tests**

`fe/test/AreaPicker.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AreaPicker } from "@/modules/directory/component/AreaPicker";

const YOGYA = { countryCode: "ID", country: "Indonesia", province: "DI Yogyakarta" };

describe("AreaPicker", () => {
  describe("positive", () => {
    it("saves the province picked, with its country", async () => {
      const onSave = vi.fn();
      render(<AreaPicker area={null} onSave={onSave} onClear={vi.fn()} />);

      await userEvent.click(screen.getByRole("button", { name: "Choose your area" }));
      await userEvent.click(await screen.findByRole("combobox", { name: "Province" }));
      await userEvent.click(await screen.findByRole("option", { name: "DI Yogyakarta" }));
      await userEvent.click(screen.getByRole("button", { name: "Save area" }));

      expect(onSave).toHaveBeenCalledWith(YOGYA);
    });

    it("names the saved area on the button", () => {
      render(<AreaPicker area={YOGYA} onSave={vi.fn()} onClear={vi.fn()} />);

      expect(screen.getByRole("button", { name: "DI Yogyakarta, Indonesia" })).toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("starts from the saved area when opened", async () => {
      render(<AreaPicker area={YOGYA} onSave={vi.fn()} onClear={vi.fn()} />);

      await userEvent.click(screen.getByRole("button", { name: "DI Yogyakarta, Indonesia" }));

      expect(await screen.findByRole("combobox", { name: "Province" })).toHaveTextContent("DI Yogyakarta");
    });

    it("clears a saved area", async () => {
      const onClear = vi.fn();
      render(<AreaPicker area={YOGYA} onSave={vi.fn()} onClear={onClear} />);

      await userEvent.click(screen.getByRole("button", { name: "DI Yogyakarta, Indonesia" }));
      await userEvent.click(await screen.findByRole("button", { name: "Clear area" }));

      expect(onClear).toHaveBeenCalled();
    });
  });

  describe("negative", () => {
    it("does not save without a province, and offers nothing to clear", async () => {
      render(<AreaPicker area={null} onSave={vi.fn()} onClear={vi.fn()} />);

      await userEvent.click(screen.getByRole("button", { name: "Choose your area" }));

      expect(await screen.findByRole("button", { name: "Save area" })).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Clear area" })).not.toBeInTheDocument();
    });
  });
});
```

`fe/test/FeaturedEvents.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FeaturedEvents } from "@/modules/directory/component/FeaturedEvents";

import { category, entry, metadata, summary } from "./fixtures/directory";

function race(eventId: number) {
  return entry(summary(eventId, {}, [category(0)]), metadata());
}

describe("FeaturedEvents", () => {
  it("renders nothing without races to feature", () => {
    const { container } = render(<FeaturedEvents entries={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("gives the first race the large card and the next two the side", () => {
    render(<FeaturedEvents entries={[race(0), race(1), race(2)]} />);

    const region = screen.getByRole("region", { name: "Featured races" });
    expect(within(region).getAllByRole("link")).toHaveLength(3);
    expect(within(region).getByRole("heading", { name: "Jakarta Marathon 0" })).toHaveClass("heading-hero");
    expect(within(region).getByRole("heading", { name: "Jakarta Marathon 1" })).not.toHaveClass("heading-hero");
  });

  it("lets a single race take the whole row", () => {
    render(<FeaturedEvents entries={[race(0)]} />);

    expect(within(screen.getByRole("region", { name: "Featured races" })).getAllByRole("link")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter fe exec vitest run test/AreaPicker.test.tsx test/FeaturedEvents.test.tsx`
Expected: FAIL — components not found.

- [ ] **Step 3: Implement the area picker**

`fe/src/modules/directory/component/AreaForm.tsx`:

```tsx
"use client";

/**
 * The country and province behind "Races in your area".
 *
 * Indonesia is preselected, unlike the organiser's place fields, which start
 * empty (PlaceFields). That form writes a frozen document, where a wrong
 * prefilled country would be permanent. This is a browsing preference for a
 * pilot run in Indonesia, and changing it takes one tap.
 */
import { useState } from "react";

import { SearchableSelect } from "@/components/elements/SearchableSelect";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Area } from "@/lib/area";
import { countries, countryName, provincesOf } from "@/lib/places";

const DEFAULT_COUNTRY = "ID";

interface AreaFormProps {
  area: Area | null;
  onSave: (area: Area) => void;
  onClear: () => void;
}

export function AreaForm({ area, onSave, onClear }: AreaFormProps) {
  // The dialog unmounts its content when it closes, so this starts from the
  // saved area every time it opens.
  const [country, setCountry] = useState(area?.countryCode ?? DEFAULT_COUNTRY);
  const [province, setProvince] = useState(area?.province ?? "");
  const provinces = provincesOf(country);
  const ready = country.length > 0 && province.trim().length > 0;

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="area-country">Country</Label>
          <SearchableSelect
            id="area-country"
            ariaLabel="Country"
            options={countries.map((item) => ({ value: item.iso2, label: item.name }))}
            value={country}
            onChange={(next) => {
              setCountry(next);
              setProvince("");
            }}
            placeholder="Select country"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="area-province">Province</Label>
          {provinces.length > 0 ? (
            <SearchableSelect
              id="area-province"
              ariaLabel="Province"
              options={provinces.map((item) => ({ value: item.name, label: item.name }))}
              value={province}
              onChange={setProvince}
              placeholder="Search provinces"
            />
          ) : (
            <Input
              id="area-province"
              aria-label="Province"
              value={province}
              onChange={(event) => setProvince(event.target.value)}
              placeholder="Type the province or state"
            />
          )}
        </div>
      </div>

      <DialogFooter>
        {area ? (
          <Button variant="ghost" onClick={onClear}>
            Clear area
          </Button>
        ) : null}
        <Button
          disabled={!ready}
          onClick={() =>
            onSave({ countryCode: country, country: countryName(country) ?? country, province: province.trim() })
          }
        >
          Save area
        </Button>
      </DialogFooter>
    </>
  );
}
```

`fe/src/modules/directory/component/AreaPicker.tsx`:

```tsx
"use client";

/**
 * The visitor's area, named in the header, chosen in a dialog.
 *
 * The form is loaded only when the dialog opens. Its province list comes from
 * the places dataset, 176 KB of JSON (50 KB gzipped), and a visitor who never
 * picks an area should not download that to read a list of races. The button's
 * own label needs none of it: the country name is stored with the area.
 */
import { MapPinIcon } from "lucide-react";
import { Suspense, lazy, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Area } from "@/lib/area";

const AreaForm = lazy(() => import("./AreaForm").then((module) => ({ default: module.AreaForm })));

interface AreaPickerProps {
  area: Area | null;
  onSave: (area: Area) => void;
  onClear: () => void;
}

export function AreaPicker({ area, onSave, onClear }: AreaPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-3 text-n-600">
          <MapPinIcon aria-hidden />
          {area ? `${area.province}, ${area.country}` : "Choose your area"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="heading-strong text-xl text-ink">Your area</DialogTitle>
          <DialogDescription>
            Races in this province get a row of their own. The choice is saved in this browser only.
          </DialogDescription>
        </DialogHeader>
        <Suspense fallback={<p role="status" className="text-sm text-n-500">Loading provinces</p>}>
          <AreaForm
            area={area}
            onSave={(next) => {
              onSave(next);
              setOpen(false);
            }}
            onClear={() => {
              onClear();
              setOpen(false);
            }}
          />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Implement the featured row**

`fe/src/modules/directory/component/FeaturedEvents.tsx`:

```tsx
/**
 * The top of the directory: one race large, up to two beside it.
 *
 * Only races with a poster reach here (`pickFeatured`), because a large empty
 * frame is the worst possible first thing on the page. With one race it takes
 * the whole row rather than leaving an empty column beside it.
 */
import { cn } from "@/utils/cn";

import type { DirectoryEntry } from "../browse";
import { EventCard } from "./EventCard";

export function FeaturedEvents({ entries }: { entries: readonly DirectoryEntry[] }) {
  const [lead, ...rest] = entries;
  if (!lead) return null;

  return (
    <section aria-label="Featured races" className={cn("grid gap-4", rest.length > 0 && "lg:grid-cols-3")}>
      <div className={cn(rest.length > 0 && "lg:col-span-2")}>
        <EventCard entry={lead} documentLoading={false} variant="featured" />
      </div>
      {rest.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {rest.map((item) => (
            <EventCard key={item.summary.event.eventId} entry={item} documentLoading={false} variant="side" />
          ))}
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm --filter fe exec vitest run test/AreaPicker.test.tsx test/FeaturedEvents.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add fe/src/modules/directory/component/AreaPicker.tsx fe/src/modules/directory/component/AreaForm.tsx fe/src/modules/directory/component/FeaturedEvents.tsx fe/test/AreaPicker.test.tsx fe/test/FeaturedEvents.test.tsx
git commit -F - <<'EOF'
fe: let visitors pick their area, and feature races with posters

The province list is 176 KB, so its form loads only when the dialog opens
and the header names the area from what was saved. The featured row gives
one race the large card and lets a lone race take the whole row instead of
leaving an empty column.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01282Bg6Fch4Zhxtjz1yDHJ4
EOF
```

---

### Task 9: Assemble the directory page

**Files:**
- Rewrite: `fe/src/modules/directory/Directory.tsx`
- Modify: `fe/src/modules/directory/component/DirectorySkeleton.tsx`
- Rewrite: `fe/test/Directory.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2 to 8.
- Produces: `Directory()` (unchanged export name, rendered by `fe/app/(browse)/page.tsx`).

- [ ] **Step 1: Write the failing test**

Replace the whole of `fe/test/Directory.test.tsx` with:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SterunCategory, SterunEvent } from "@sterunxyz/sdk";

import { AREA_STORAGE_KEY } from "@/lib/area";
import type { EventMetadata } from "@/lib/metadata";
import { Directory } from "@/modules/directory/Directory";

import { category, metadata, summary } from "./fixtures/directory";

const listEvents = vi.hoisted(() => vi.fn());
const fetchEventMetadata = vi.hoisted(() => vi.fn());

vi.mock("@/lib/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/events")>()),
  listEvents,
}));
vi.mock("@/lib/metadata", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/metadata")>()),
  fetchEventMetadata,
}));

const HASH = "ab".repeat(32);
const UNAVAILABLE = { status: "unavailable", reason: "Not served in this test." };
const JAKARTA = { name: "Monas", city: "Jakarta Pusat", province: "DKI Jakarta", country: "Indonesia", countryCode: "ID" };

/** An event with a document at a uri the mock below can answer for. */
function withDocument(
  eventId: number,
  overrides: Partial<SterunEvent> = {},
  categories: SterunCategory[] = [category(0)],
) {
  return summary(eventId, { uri: `https://files.test/${eventId}.json`, metadataHash: HASH, ...overrides }, categories);
}

function serve(documents: Record<number, EventMetadata | "modified">) {
  fetchEventMetadata.mockImplementation(async (uri: string) => {
    const match = /\/(\d+)\.json$/.exec(uri);
    const document = match ? documents[Number(match[1])] : undefined;
    if (document === undefined) return UNAVAILABLE;
    if (document === "modified") return { status: "modified", expectedHash: HASH, actualHash: "cd".repeat(32) };
    return { status: "verified", document };
  });
}

function renderDirectory() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<Directory />, { wrapper: Wrapper });
}

/**
 * A read the test finishes on purpose.
 *
 * A promise that never settles leaves React Query mid-flight when the test
 * ends, and cleanup then waits ten seconds for it.
 */
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return {
    promise,
    settle: async (value: unknown) => {
      resolve(value);
      await act(async () => {
        await promise;
      });
    },
  };
}

function searchbox() {
  return screen.getByRole("searchbox", { name: "Search races" });
}

beforeEach(() => {
  listEvents.mockReset();
  fetchEventMetadata.mockReset();
  fetchEventMetadata.mockResolvedValue(UNAVAILABLE);
  window.localStorage.clear();
});

describe("Directory", () => {
  describe("positive", () => {
    it("lists a card per event under All races", async () => {
      listEvents.mockResolvedValue({ events: [summary(0), summary(1)], unreadable: [] });

      renderDirectory();

      const all = await screen.findByRole("region", { name: "All races" });
      expect(within(all).getByText("Jakarta Marathon 0")).toBeInTheDocument();
      expect(within(all).getByText("Jakarta Marathon 1")).toBeInTheDocument();
    });

    it("links each card to that event's page", async () => {
      listEvents.mockResolvedValue({ events: [summary(4)], unreadable: [] });

      renderDirectory();

      const link = await screen.findByRole("link", { name: /Jakarta Marathon 4/ });
      expect(link).toHaveAttribute("href", "/events/4");
    });

    it("counts entries left across distances and shows the starting price", async () => {
      listEvents.mockResolvedValue({
        events: [summary(0, {}, [category(0), category(1, { quota: 50, enteredCount: 20 })])],
        unreadable: [],
      });

      renderDirectory();

      expect(await screen.findByText("150 entries left")).toBeInTheDocument();
      expect(screen.getByText("From sUSD 25")).toBeInTheDocument();
    });

    it("shows the status of every event", async () => {
      listEvents.mockResolvedValue({
        events: [summary(0, { status: "Open" }), summary(1, { status: "Completed" })],
        unreadable: [],
      });

      renderDirectory();

      expect(await screen.findByText("Open")).toBeInTheDocument();
      expect(screen.getByText("Completed")).toBeInTheDocument();
    });

    it("re-reads the chain when asked to refresh", async () => {
      // STE-13's acceptance scenario: create an event on testnet, refresh, see
      // it here without redeploying anything.
      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [] });
      renderDirectory();
      await screen.findByText("Jakarta Marathon 0");

      listEvents.mockResolvedValue({ events: [summary(0), summary(1, { name: "Brand New Race" })], unreadable: [] });
      await userEvent.click(screen.getByRole("button", { name: /refresh/i }));

      expect(await screen.findByText("Brand New Race")).toBeInTheDocument();
    });

    it("features an open, upcoming race that has a poster", async () => {
      listEvents.mockResolvedValue({ events: [withDocument(0), summary(1)], unreadable: [] });
      serve({ 0: metadata() });

      renderDirectory();

      const featured = await screen.findByRole("region", { name: "Featured races" });
      expect(within(featured).getByText("Jakarta Marathon 0")).toBeInTheDocument();
      expect(within(featured).queryByText("Jakarta Marathon 1")).not.toBeInTheDocument();
    });

    it("shows the venue from a verified document", async () => {
      listEvents.mockResolvedValue({ events: [withDocument(0)], unreadable: [] });
      serve({ 0: metadata() });

      renderDirectory();

      const all = await screen.findByRole("region", { name: "All races" });
      expect(await within(all).findByText("FT UGM, Sleman")).toBeInTheDocument();
    });

    it("narrows the list by search and hides the featured row", async () => {
      listEvents.mockResolvedValue({
        events: [withDocument(0, { name: "Elektro Dash" }), withDocument(1, { name: "Monas Night Run" })],
        unreadable: [],
      });
      serve({ 0: metadata(), 1: metadata({ location: JAKARTA }) });
      renderDirectory();
      await screen.findByRole("region", { name: "Featured races" });

      await userEvent.type(searchbox(), "jakarta");

      const results = await screen.findByRole("region", { name: "1 race matches" });
      expect(within(results).getByText("Monas Night Run")).toBeInTheDocument();
      expect(screen.queryByText("Elektro Dash")).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Featured races" })).not.toBeInTheDocument();
    });

    it("gives races in the chosen area a row of their own", async () => {
      window.localStorage.setItem(
        AREA_STORAGE_KEY,
        JSON.stringify({ countryCode: "ID", country: "Indonesia", province: "DI Yogyakarta" }),
      );
      listEvents.mockResolvedValue({
        events: [withDocument(0, { name: "Elektro Dash" }), withDocument(1, { name: "Monas Night Run" })],
        unreadable: [],
      });
      serve({ 0: metadata(), 1: metadata({ location: JAKARTA }) });

      renderDirectory();

      const nearby = await screen.findByRole("region", { name: "Races in your area" });
      expect(within(nearby).getByText("Elektro Dash")).toBeInTheDocument();
      expect(within(nearby).queryByText("Monas Night Run")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "DI Yogyakarta, Indonesia" })).toBeInTheDocument();
    });

    it("applies a filter from the drawer and lists it as a removable chip", async () => {
      listEvents.mockResolvedValue({
        events: [
          summary(0, { name: "Free Fun Run" }, [category(0, { priceStroops: 0n })]),
          summary(1, { name: "Paid Road Race" }, [category(0)]),
        ],
        unreadable: [],
      });
      renderDirectory();
      await screen.findByText("Free Fun Run");

      await userEvent.click(screen.getByRole("button", { name: "Filters" }));
      await userEvent.click(await screen.findByRole("checkbox", { name: "Free" }));
      await userEvent.click(screen.getByRole("button", { name: "Show 1 race" }));

      expect(await screen.findByRole("region", { name: "1 race matches" })).toBeInTheDocument();
      expect(screen.queryByText("Paid Road Race")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Remove Free" }));

      expect(await screen.findByText("Paid Road Race")).toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("shows a loading state before the first read comes back", async () => {
      const pending = deferred();
      listEvents.mockReturnValue(pending.promise);

      renderDirectory();

      expect(screen.getByRole("status")).toBeInTheDocument();
      await pending.settle({ events: [], unreadable: [] });
    });

    it("does not claim the directory is empty while it is still loading", async () => {
      const pending = deferred();
      listEvents.mockReturnValue(pending.promise);

      renderDirectory();

      expect(screen.queryByText(/no events/i)).not.toBeInTheDocument();
      await pending.settle({ events: [], unreadable: [] });
    });

    it("says the registry is empty when it really is", async () => {
      listEvents.mockResolvedValue({ events: [], unreadable: [] });

      renderDirectory();

      expect(await screen.findByText("No events yet")).toBeInTheDocument();
    });

    it("shows an event that has no distances yet", async () => {
      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [] });

      renderDirectory();

      expect(await screen.findByText("Jakarta Marathon 0")).toBeInTheDocument();
      expect(screen.getByText("No distances yet")).toBeInTheDocument();
    });

    it("draws No image for a race whose document could not be read", async () => {
      listEvents.mockResolvedValue({ events: [withDocument(0)], unreadable: [] });

      renderDirectory();

      expect(await screen.findByText("No image")).toBeInTheDocument();
    });

    it("says so when nothing matches, and offers a way back", async () => {
      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [] });
      renderDirectory();
      await screen.findByText("Jakarta Marathon 0");

      await userEvent.type(searchbox(), "nowhere");

      expect(await screen.findByText("No races match")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Clear search and filters" }));
      expect(await screen.findByText("Jakarta Marathon 0")).toBeInTheDocument();
      expect(searchbox()).toHaveValue("");
    });

    it("says there are no races in the chosen area yet", async () => {
      window.localStorage.setItem(AREA_STORAGE_KEY, JSON.stringify({ countryCode: "ID", country: "Indonesia", province: "Bali" }));
      listEvents.mockResolvedValue({ events: [withDocument(0)], unreadable: [] });
      serve({ 0: metadata() });

      renderDirectory();

      expect(await screen.findByText("No races in Bali yet.")).toBeInTheDocument();
    });

    it("mentions events the registry counted but would not return", async () => {
      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [3, 4] });

      renderDirectory();

      expect(await screen.findByText(/2 events could not be read/i)).toBeInTheDocument();
    });

    it("says nothing about unreadable events when there are none", async () => {
      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [] });

      renderDirectory();

      await screen.findByText("Jakarta Marathon 0");
      expect(screen.queryByText(/could not be read/i)).not.toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("reports a failed read as an error and offers a way out, never an empty directory", async () => {
      // Drawing "no events yet" over a dead RPC would tell every visitor the
      // protocol is unused. The recovery half is asserted in the same test: a
      // rejected query that is the last thing a test did surfaces as an
      // unhandled rejection under this vitest setup.
      listEvents.mockRejectedValue(new Error("rpc unreachable"));
      renderDirectory();

      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(screen.queryByText("No events yet")).not.toBeInTheDocument();

      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [] });
      await userEvent.click(screen.getByRole("button", { name: /try again/i }));

      expect(await screen.findByText("Jakarta Marathon 0")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("never features a race whose document fails its hash check", async () => {
      listEvents.mockResolvedValue({ events: [withDocument(0)], unreadable: [] });
      serve({ 0: "modified" });

      renderDirectory();

      expect(await screen.findByText("No image")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Featured races" })).not.toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter fe exec vitest run test/Directory.test.tsx`
Expected: FAIL — no "All races" region, no search box, no featured row.

- [ ] **Step 3: Update the skeleton**

Replace the whole of `fe/src/modules/directory/component/DirectorySkeleton.tsx` with:

```tsx
/**
 * What the directory shows while the chain is being read.
 *
 * A public testnet node takes a second or two to answer, and every id is a
 * separate simulation, so this is not a rare frame. Shaped like the cards it
 * stands in for, poster frame included, so nothing jumps when they arrive.
 * `role="status"` because the difference between "loading" and "there are no
 * races" has to be available to somebody who cannot see the shimmer.
 */
const PULSE = "animate-pulse bg-n-100 motion-reduce:animate-none";

export function DirectorySkeleton() {
  return (
    <div
      role="status"
      aria-label="Reading events from the chain"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {[0, 1, 2, 3, 4, 5].map((card) => (
        <div key={card} className="overflow-hidden rounded-lg border border-n-200 bg-paper shadow-card">
          <div className={`aspect-video w-full ${PULSE}`} />
          <div className="flex flex-col gap-3 p-4">
            <div className={`h-5 w-2/3 rounded-sm ${PULSE}`} />
            <div className={`h-4 w-1/2 rounded-sm ${PULSE}`} />
            <div className={`h-4 w-1/3 rounded-sm ${PULSE}`} />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Rewrite the page**

Replace the whole of `fe/src/modules/directory/Directory.tsx` with:

```tsx
"use client";

/**
 * STE-13 — the public race directory, read from the chain on every visit.
 * Redesigned poster-first on 2026-09-11
 * (docs/superpowers/specs/2026-09-11-directory-redesign-design.md).
 *
 * Four states, and the distinction between three of them is the whole point of
 * the page: loading, empty, failed, and a list. An empty registry and an
 * unreachable RPC must never look alike, because "no races exist" is a claim
 * about the protocol and "we could not ask" is a claim about the network.
 *
 * Everything a card shows beyond the chain (poster, venue, province) comes from
 * each event's document through the same verified query the event page uses,
 * so an unproven document contributes nothing here either. The featured row and
 * the area row wait until every document has answered, so they are chosen once
 * instead of reshuffling as posters arrive.
 *
 * The refresh control stays for the acceptance scenario in the ticket: create
 * an event, press refresh, and it appears without this app being redeployed.
 */
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCwIcon, SearchIcon } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/elements/EmptyState";
import { ErrorNotice } from "@/components/elements/ErrorNotice";
import { ChainSource } from "@/components/layouts/ChainSource";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useArea } from "@/hooks/useArea";
import { useEventDocuments } from "@/hooks/useEventDocuments";
import { eventKeys, useEvents } from "@/hooks/useEvents";
import { useNowSeconds } from "@/hooks/useNowSeconds";
import { cn } from "@/utils/cn";

import {
  inArea,
  matchesSearch,
  pickFeatured,
  sortByDate,
  type DateOrder,
  type DirectoryEntry,
} from "./browse";
import { AreaPicker } from "./component/AreaPicker";
import { DirectorySkeleton } from "./component/DirectorySkeleton";
import { EventCard } from "./component/EventCard";
import { FeaturedEvents } from "./component/FeaturedEvents";
import { FilterChips } from "./component/FilterChips";
import { FilterDrawer } from "./component/FilterDrawer";
import { NO_FILTERS, activeFilterCount, matchesFilters, type Filters } from "./filters";

export function Directory() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, isFetching, refetch } = useEvents();
  const summaries = data?.events ?? [];
  const documents = useEventDocuments(summaries);
  const { area, setArea, clearArea } = useArea();
  const nowS = useNowSeconds();

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [order, setOrder] = useState<DateOrder>("soonest");

  const entries: DirectoryEntry[] = summaries.map((summary) => ({
    summary,
    document: documents.byEvent.get(summary.event.eventId) ?? null,
  }));
  const searched = entries.filter((item) => matchesSearch(item, query));
  const results = sortByDate(
    searched.filter((item) => matchesFilters(item, filters)),
    order,
    nowS ?? 0n,
  );
  const narrowing = query.trim().length > 0 || activeFilterCount(filters) > 0;
  const featured =
    !narrowing && documents.settled && nowS !== undefined ? pickFeatured(entries, nowS) : [];
  const nearby =
    !narrowing && area && documents.settled
      ? sortByDate(
          entries.filter((item) => inArea(item, area)),
          order,
          nowS ?? 0n,
        )
      : null;

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: eventKeys.all });
  }

  function clearNarrowing() {
    setQuery("");
    setFilters(NO_FILTERS);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-8 sm:py-10">
      <header className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <AreaPicker area={area} onSave={setArea} onClear={clearArea} />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={isFetching ? "Refreshing" : "Refresh"}
            onClick={refresh}
            disabled={isFetching}
          >
            <RefreshCwIcon aria-hidden className={cn(isFetching && "animate-spin motion-reduce:animate-none")} />
          </Button>
        </div>

        <div className="flex flex-col items-center gap-5 text-center">
          <h1 className="heading-hero text-4xl text-ink sm:text-5xl">Browse races</h1>
          <div className="flex w-full max-w-xl items-center gap-2">
            <div className="relative flex-1">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-n-400"
              />
              <Input
                type="search"
                aria-label="Search races"
                placeholder="Search by race, venue or city"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
              />
            </div>
            <FilterDrawer
              entries={searched}
              filters={filters}
              order={order}
              preferredCountry={area?.countryCode}
              onApply={(nextFilters, nextOrder) => {
                setFilters(nextFilters);
                setOrder(nextOrder);
              }}
            />
          </div>
          <FilterChips filters={filters} onChange={setFilters} onClear={() => setFilters(NO_FILTERS)} />
        </div>
      </header>

      {isPending ? <DirectorySkeleton /> : null}

      {isError ? (
        <ErrorNotice
          title="The event registry could not be read"
          detail="This is a network or node problem, not an empty directory. The races are still on chain."
          onRetry={() => void refetch()}
        />
      ) : null}

      {data && data.events.length === 0 ? (
        <EmptyState title="No events yet">
          The registry on this network holds no events. One created with the organiser console shows
          up here on the next refresh.
        </EmptyState>
      ) : null}

      {data && data.events.length > 0 ? (
        <>
          <FeaturedEvents entries={featured} />

          {nearby && area ? (
            <section aria-labelledby="directory-nearby" className="flex flex-col gap-4">
              <h2 id="directory-nearby" className="heading-strong text-2xl text-ink">
                Races in your area
              </h2>
              {nearby.length > 0 ? (
                <EventGrid entries={nearby} pending={documents.pending} />
              ) : (
                <p className="text-base text-n-500">No races in {area.province} yet.</p>
              )}
            </section>
          ) : null}

          <section aria-labelledby="directory-all" className="flex flex-col gap-4">
            <h2 id="directory-all" className="heading-strong text-2xl text-ink">
              {narrowing
                ? `${results.length} ${results.length === 1 ? "race matches" : "races match"}`
                : "All races"}
            </h2>
            {results.length > 0 ? (
              <EventGrid entries={results} pending={documents.pending} />
            ) : (
              <>
                <EmptyState title="No races match">Try a different search or fewer filters.</EmptyState>
                <Button variant="link" className="self-center" onClick={clearNarrowing}>
                  Clear search and filters
                </Button>
              </>
            )}
          </section>
        </>
      ) : null}

      {data && data.unreadable.length > 0 ? (
        <p className="text-sm text-n-500">
          {data.unreadable.length} events could not be read from the registry. Ledger entries expire
          on Soroban, so an old event may need its state restored before it can be shown again.
        </p>
      ) : null}

      <ChainSource />
    </div>
  );
}

function EventGrid({
  entries,
  pending,
}: {
  entries: readonly DirectoryEntry[];
  pending: ReadonlySet<number>;
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((item) => (
        <li key={item.summary.event.eventId}>
          <EventCard entry={item} documentLoading={pending.has(item.summary.event.eventId)} />
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter fe exec vitest run test/Directory.test.tsx test/ui-rules.test.ts`
Expected: PASS. `ui-rules` guards against dashes, Indonesian and hex in the new files.

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm --filter fe typecheck && pnpm --filter fe lint`
Expected: no errors. A React Compiler complaint about a value read during render means something is calling `Date.now()` or setting state in an effect; fix it with the hooks from Task 3, do not disable the rule.

- [ ] **Step 7: Commit**

```bash
git add fe/src/modules/directory/Directory.tsx fe/src/modules/directory/component/DirectorySkeleton.tsx fe/test/Directory.test.tsx
git commit -F - <<'EOF'
fe: rebuild the directory around posters, area, search and filters

The page now opens with races that have a poster, gives the visitor's
province its own row, and lists every race as a poster card. Search and
filters narrow the list and hide the featured rows, so what is shown always
answers what was asked. Loading, empty and failed states keep their meaning.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01282Bg6Fch4Zhxtjz1yDHJ4
EOF
```

---

### Task 10: Wizard poster hint and documentation

**Files:**
- Modify: `fe/src/modules/organiser/component/StepDetails.tsx:257-258`
- Modify: `docs/WEB_APP_IA.md` (§3 table, the `/` row)
- Modify: `fe/CLAUDE.md` (new section before "### `/org` — the events this wallet organises")

- [ ] **Step 1: Update the hint**

In `fe/src/modules/organiser/component/StepDetails.tsx`, replace:

```tsx
          hint="PNG or JPEG, 1200 px wide or more, up to 5 MB."
          help="It sits at the top of your event page, as wide as the page and up to about 400 px tall, so a wide picture fills that space and a tall one is shown smaller. Any shape works. Under 1200 px wide it starts to look soft on a good screen."
```

with:

```tsx
          hint="16:9, 1920 × 1080 px recommended. PNG or JPEG, up to 5 MB."
          help="The same picture is used on your event page and on its card in the race directory, both in a 16:9 frame. Other shapes still work: they are shown whole, with a blurred copy of the picture filling the space around them. Under 1280 px wide it starts to look soft on a good screen."
```

- [ ] **Step 2: Update the IA table**

In `docs/WEB_APP_IA.md`, replace the row that starts with `` | `/` | Event cards: name, date, status badge, category summary. `` with:

```markdown
| `/` | Poster-first directory (redesigned 2026-09-11, spec `docs/superpowers/specs/2026-09-11-directory-redesign-design.md`): a featured row of `Open`, upcoming races that have a poster; a "Races in your area" row for the province the visitor chose (saved in their browser); every race as a card with its poster in a 16:9 frame (shown whole, never cropped; "No image" without one), venue, date, entries left and starting price. Search, plus a filter drawer: date order, location, price, distance, open only. Loading + empty + error states. | the chain (RPC) for the races, plus each event's verified metadata document for poster and location | STE-13 |
```

- [ ] **Step 3: Record the decisions in `fe/CLAUDE.md`**

Insert directly above the line `### \`/org\` — the events this wallet organises`:

```markdown
### `/` — the poster-first directory (2026-09-11)

`modules/directory/`. Design: `docs/superpowers/specs/2026-09-11-directory-redesign-design.md`.
What is settled:

- **Posters come from each event's document**, read by `useEventDocuments` through
  `metadataQuery`, the same cache entry `/events/[id]` uses. An unproven document contributes
  nothing: no poster, no venue, no province.
- **The poster frame is 16:9 and never crops** (`PosterFrame`). The poster is shown whole over a
  blurred copy of itself, because posters carry their own date and venue as text. No poster, a
  failed hash, or a broken image all say **"No image"** (Ancung chose that over a decorative
  placeholder: a missing picture should read as missing).
- **Featured** = `Open`, upcoming, has a poster, soonest first, at most three. Chosen once every
  document has answered, so the row does not reshuffle.
- **Area is by province**, picked by the visitor and stored in `localStorage` (`lib/area.ts`). The
  form is `React.lazy`: the places dataset is 176 KB and the directory must not load it up front.
- **Filters** live in a staged drawer. Price and distance are matched on the same category; price
  buckets are fixed, not a slider. Labels use "to", never a dash (`ui-rules.test.ts`).
- All decisions are pure functions in `browse.ts` and `filters.ts`. Test those, not the page.
```

- [ ] **Step 4: Run the checks that cover these files**

Run: `pnpm --filter fe exec vitest run test/ui-rules.test.ts test/CreateEvent.test.tsx`
Expected: PASS (the hint uses "×", not a dash).

- [ ] **Step 5: Commit**

```bash
git add fe/src/modules/organiser/component/StepDetails.tsx docs/WEB_APP_IA.md fe/CLAUDE.md
git commit -F - <<'EOF'
fe: recommend 16:9 posters and record the directory's decisions

The poster an organiser uploads now fills a 16:9 frame on both the event
page and the directory card, so the wizard asks for that shape instead of
only a minimum width. The IA table and fe/CLAUDE.md describe the new
directory so the next change does not undo a decision by accident.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01282Bg6Fch4Zhxtjz1yDHJ4
EOF
```

---

### Task 11: Full verification, and checking it by eye

**Files:** none new, unless a check fails.

- [ ] **Step 1: Run every gate**

```bash
pnpm --filter @sterunxyz/sdk build
pnpm --filter fe typecheck
pnpm --filter fe lint
pnpm --filter fe test
pnpm --filter fe build
```

Expected: all pass. The full test suite is slow on a busy machine; a wave of timeouts in unrelated wizard tests means the machine is loaded, so rerun before suspecting the code. Record the final test count.

- [ ] **Step 2: Look at it**

Ancung reviews by screenshot, and green tests do not prove the layout. With the dev server on `http://localhost:3000` (start one with `pnpm --filter fe dev` if none is running; do not restart one that is already running), use the Playwright MCP tools and save screenshots under `.playwright-mcp/` (inside the repo, gitignored):

1. 1440×900: `/` full page after posters load (wait ~8s). Check: featured row shows Elektro Dash / TechSprint / the lorem 5K posters whole with blurred bands, not cropped; grid is 3 columns; "No image" cards look intentional; titles do not overflow; status badges sit on the poster corner.
2. 1440×900: open **Filters**. Check: drawer on the right, sections readable, "Show n races" updates when ticking.
3. 1440×900: **Choose your area**, pick DI Yogyakarta, save. Check "Races in your area" appears with the Sleman races.
4. 390×844: `/` full page. Check: one column, no horizontal scroll, search and filter button fit on one line, drawer opens from the bottom.
5. 1440×900: `/events/13`. Check nothing changed on the event page.

Fix anything that looks wrong, rerun the affected tests, and commit each fix separately with a message saying what was seen.

- [ ] **Step 3: Report back, do not push**

Tell Ancung (in Indonesian, short): what was built, the final test count, the screenshots, anything that looked off and how it was fixed, and that the branch is committed but not pushed.
