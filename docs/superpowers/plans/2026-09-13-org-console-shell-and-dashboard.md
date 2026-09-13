# Organiser console — shell and dashboard: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/org` a sidebar shell and rebuild its landing page into a dashboard that tells an
organiser which race needs them, and close the two live bugs that the design surfaced.

**Architecture:** A route-group layout (`app/(organiser)/org/layout.tsx`) wraps every organiser page
in a shell that owns the sidebar and the header. Everything the dashboard draws is derived by pure
functions in `src/modules/organiser/` and `src/lib/`, fed by two sources: the chain through
`readClient` (status, quotas, add-ons) and the indexer through `apiFetch` (per-entry timestamps).
Pure functions carry the tests; components stay thin enough to read.

**Tech Stack:** Next.js App Router, React 19, TanStack Query, Tailwind v4 + shadcn/ui,
`lucide-react`, `@sterunxyz/sdk`, Vitest + Testing Library.

**Spec:** [`../specs/2026-09-13-org-console-design.md`](../specs/2026-09-13-org-console-design.md).
The mockup beside it is the visual reference; open it in a browser before starting.

**Follow-on plan:** the four per-race tabs are
[`2026-09-13-org-event-console-tabs.md`](2026-09-13-org-event-console-tabs.md). Nothing here depends
on it.

## Global Constraints

Every task's requirements implicitly include all of this.

- **All UI text is English.** Labels, headings, empty states, placeholders, errors.
- **UI text names the consequence, not the mechanism.** The words *chain*, *contract*,
  *transaction*, *hash*, *revert*, *indexer* never reach the screen. (`fe/CLAUDE.md` → Conventions.)
- **A warning that has a cost is never hidden in a tooltip.** It goes in visible copy.
- **The word "Draft" never appears in the interface.** It renders as **"Not open yet"**.
- **The comparison chart is called "Entries comparison", never "Pace".** In a running product *pace*
  means minutes per kilometre.
- **Icons come from `lucide-react`** (already a dependency, `^1.42.0`, already used in
  `src/components/elements/`). No emoji, no inline icon SVG.
- **No raw hex, font name or pixel value in a component.** Use the tokens in `fe/app/tokens.css`
  through Tailwind classes. If a value is missing, add a token.
- **No error reaches the screen as it was thrown.** Route everything through `friendlyError` in
  `src/lib/errors.ts`.
- **Tests never touch the network.** `vitest.config.ts` points at the production API, so anything
  reaching `fetch`, `@/lib/sterun` or `@/lib/api` is mocked.
- Path alias `@/` resolves to `fe/src/`.
- Run tests with `pnpm --filter fe test <path>` from the repository root.
- One commit per task, subject line referencing **STE-17**.

---

## File structure

**Created**

| File | Responsibility |
| --- | --- |
| `fe/src/lib/status-label.ts` | the one map from `EventStatus` to the words a person reads |
| `fe/src/lib/records.ts` | pure maths over indexer records: per-day counts, cumulative fill, trending |
| `fe/src/lib/run-progress.ts` | reading and writing a wizard run's progress |
| `fe/src/hooks/useRaceRecords.ts` | indexer reads for a set of races |
| `fe/src/hooks/useScannerCounts.ts` | how many scanners a race has, for the races worth asking about |
| `fe/src/modules/organiser/needs.ts` | pure: what is waiting on the organiser |
| `fe/src/modules/organiser/chart.ts` | pure: SVG path geometry for sparklines and the comparison chart |
| `fe/src/modules/organiser/component/ConsoleSidebar.tsx` | the dark rail: Dashboard, and Events as an expander |
| `fe/src/modules/organiser/component/ConsoleHeader.tsx` | page title, bell, and a slot for the page's one action |
| `fe/src/modules/organiser/component/NeedsBell.tsx` | the bell and its popover |
| `fe/src/modules/organiser/component/UrgentBanner.tsx` | the one thing that still interrupts |
| `fe/src/modules/organiser/component/StatCard.tsx` | a number with a thin context bar |
| `fe/src/modules/organiser/component/Sparkline.tsx` | 14 days of entries as a line |
| `fe/src/modules/organiser/component/RacesTable.tsx` | the All races table |
| `fe/src/modules/organiser/component/EntriesComparison.tsx` | fill against days to race day |
| `fe/src/modules/organiser/component/TrendingEntries.tsx` | ranked (race, distance) by last 7 days |
| `fe/app/(organiser)/org/layout.tsx` | wraps organiser routes in the shell |

**Modified**

| File | Change |
| --- | --- |
| `fe/src/components/elements/EventStatusBadge.tsx` | render the label, keep `data-status` as the raw value |
| `fe/src/modules/directory/Directory.tsx:72` | drop races that are not open before anything else sees them |
| `fe/src/hooks/useEventRun.ts` | restore and persist progress |
| `fe/src/modules/organiser/OrganiserHome.tsx` | becomes the Dashboard |
| `fe/CLAUDE.md`, `docs/WEB_APP_IA.md` | record the shape |

---

## Task 1: "Draft" reads as "Not open yet"

**Files:**
- Create: `fe/src/lib/status-label.ts`
- Create: `fe/test/status-label.test.ts`
- Modify: `fe/src/components/elements/EventStatusBadge.tsx`
- Modify: `fe/test/EventStatusBadge.test.tsx`

**Interfaces:**
- Produces: `statusLabel(status: EventStatus): string` — used by every later task that prints a
  status.

- [ ] **Step 1: Write the failing test**

Create `fe/test/status-label.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { statusLabel } from "@/lib/status-label";
import { EVENT_STATUSES } from "@sterunxyz/sdk";

describe("statusLabel", () => {
  describe("positive", () => {
    it("renames Draft to something a runner can read", () => {
      // "Draft" is a word about documents. A race is not a document, and the
      // organiser reading this has not drafted anything — the race exists, its
      // entries are simply not open.
      expect(statusLabel("Draft")).toBe("Not open yet");
    });

    it("leaves the four statuses that already read plainly", () => {
      expect(statusLabel("Open")).toBe("Open for entry");
      expect(statusLabel("Closed")).toBe("Entries closed");
      expect(statusLabel("Completed")).toBe("Finished");
      expect(statusLabel("Cancelled")).toBe("Cancelled");
    });
  });

  describe("edge", () => {
    it("has a label for every status the contract can hold", () => {
      // Walks the SDK rather than a list written here, so a sixth status would
      // fail this test instead of rendering an empty chip on a real event.
      for (const status of EVENT_STATUSES) {
        expect(statusLabel(status)).not.toBe("");
      }
    });

    it("never says the word Draft", () => {
      for (const status of EVENT_STATUSES) {
        expect(statusLabel(status)).not.toMatch(/draft/i);
      }
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter fe test test/status-label.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/status-label"`.

- [ ] **Step 3: Write the module**

Create `fe/src/lib/status-label.ts`:

```ts
/**
 * The lifecycle, in words rather than in the contract's vocabulary.
 *
 * `EventStatus` is frozen in `docs/specs/INTERFACE.md` and does not change.
 * What a person reads is ours, and one of the five needed changing: "Draft" is
 * a word about documents, and by the time an event holds that status it is
 * already on chain with a permanent name and date. Nothing about it is a draft.
 * What is true is narrower and is what the label says — its entries are not
 * open.
 *
 * The other four are spelled out for the same reason, not renamed: "Open" alone
 * does not say open for what, and "Completed" is a status word rather than the
 * thing a runner would say.
 */
import type { EventStatus } from "@sterunxyz/sdk";

const LABELS = {
  Draft: "Not open yet",
  Open: "Open for entry",
  Closed: "Entries closed",
  Completed: "Finished",
  Cancelled: "Cancelled",
} as const satisfies Record<EventStatus, string>;

export function statusLabel(status: EventStatus): string {
  return LABELS[status];
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
pnpm --filter fe test test/status-label.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Use it in the badge**

Replace the component body in `fe/src/components/elements/EventStatusBadge.tsx` (keep the file's
existing doc comment above it, and add the paragraph shown):

```tsx
import { Badge } from "@/components/ui/badge";
import { statusLabel } from "@/lib/status-label";
import type { EventStatus } from "@sterunxyz/sdk";

const VARIANTS = {
  Open: "success",
  Draft: "outline",
  Closed: "muted",
  Completed: "accent",
  Cancelled: "destructive",
} as const satisfies Record<EventStatus, string>;

/**
 * The chip shows `statusLabel`, and `data-status` still carries the contract's
 * own word. Tests and stylesheets match on the attribute rather than on the
 * sentence, so the wording can change again without either of them moving.
 */
export function EventStatusBadge({ status }: { status: EventStatus }) {
  return (
    <Badge variant={VARIANTS[status]} data-status={status}>
      {statusLabel(status)}
    </Badge>
  );
}
```

- [ ] **Step 6: Run the badge test and watch it fail**

```bash
pnpm --filter fe test test/EventStatusBadge.test.tsx
```

Expected: FAIL — two tests assert `getByText(status)` and no chip says "Draft" any more.

- [ ] **Step 7: Fix the badge test**

In `fe/test/EventStatusBadge.test.tsx`, replace the two failing cases:

```tsx
    it("names the status it was given", () => {
      render(<EventStatusBadge status="Open" />);

      expect(screen.getByText("Open for entry")).toBeInTheDocument();
    });

    it("renders every status the contract can hold", () => {
      // The lifecycle is five states since contracts v2 added Cancelled
      // (INTERFACE.md §1.2). A badge that only knows four would render a blank
      // chip on a real event, so this walks whatever the SDK currently holds
      // rather than a list written out here that can fall behind it.
      //
      // It matches on `data-status`, not on the words: the words are a product
      // decision that has already changed once (Draft → "Not open yet") and
      // this test is about coverage, not copy.
      for (const status of EVENT_STATUSES) {
        const { container, unmount } = render(<EventStatusBadge status={status} />);
        expect(container.querySelector(`[data-status="${status}"]`)).not.toBeNull();
        expect(container.textContent?.trim()).not.toBe("");
        unmount();
      }
    });
```

And add one case to the `edge` block:

```tsx
    it("never prints the word Draft", () => {
      // The contract's vocabulary stays in `data-status`; the chip is read by
      // an organiser who has not drafted anything.
      const { container } = render(<EventStatusBadge status="Draft" />);

      expect(container.textContent).not.toMatch(/draft/i);
      expect(container.querySelector('[data-status="Draft"]')).not.toBeNull();
    });
```

Also update the `getByText("Completed")` assertion in the last case to
`getByText("Finished")`.

- [ ] **Step 8: Run the whole suite**

```bash
pnpm --filter fe test
```

Expected: PASS. Any other test asserting on a status word (search with
`grep -rn '"Draft"\|"Completed"' fe/test`) must be updated the same way — match `data-status`, not
the sentence.

- [ ] **Step 9: Commit**

```bash
git add fe/src/lib/status-label.ts fe/test/status-label.test.ts \
  fe/src/components/elements/EventStatusBadge.tsx fe/test/EventStatusBadge.test.tsx
git commit -m "fe: say 'Not open yet' instead of Draft (STE-17)"
```

---

## Task 2: the directory stops listing races that are not open

**Files:**
- Modify: `fe/src/modules/directory/browse.ts`
- Modify: `fe/src/modules/directory/Directory.tsx:72`
- Modify: `fe/test/browse.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `publicEvents(summaries: readonly EventSummary[]): EventSummary[]`.

**Why this is here:** a race whose entries are not open is listed publicly today. Only
`pickFeatured` (`browse.ts:122`) and the optional "hide full races" filter (`filters.ts:77`) look at
status, so the grid, the search and the place ordering all show it.

- [ ] **Step 1: Write the failing test**

Append to `fe/test/browse.test.ts`, inside the top-level `describe`:

```ts
describe("publicEvents", () => {
  describe("positive", () => {
    it("keeps a race that is open for entry", () => {
      const open = summary(1, { status: "Open" });

      expect(publicEvents([open])).toEqual([open]);
    });

    it("keeps a race whose entries have closed, and one that has been cancelled", () => {
      // Both are races that happened or will happen, and a runner who paid has
      // every reason to find the page again. Not-open-yet is the only status
      // where there is nothing to find.
      const closed = summary(2, { status: "Closed" });
      const cancelled = summary(3, { status: "Cancelled" });

      expect(publicEvents([closed, cancelled])).toEqual([closed, cancelled]);
    });
  });

  describe("negative", () => {
    it("drops a race whose entries are not open yet", () => {
      const notOpen = summary(4, { status: "Draft" });

      expect(publicEvents([notOpen])).toEqual([]);
    });
  });

  describe("edge", () => {
    it("keeps the order it was given", () => {
      const a = summary(5, { status: "Open" });
      const b = summary(6, { status: "Draft" });
      const c = summary(7, { status: "Completed" });

      expect(publicEvents([a, b, c])).toEqual([a, c]);
    });

    it("returns an empty list rather than throwing on an empty one", () => {
      expect(publicEvents([])).toEqual([]);
    });
  });
});
```

If `browse.test.ts` has no `summary()` helper, copy the one from
`fe/test/OrganiserHome.test.tsx` (lines 36–54) into this file and import `publicEvents` from
`@/modules/directory/browse`.

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter fe test test/browse.test.ts
```

Expected: FAIL — `publicEvents is not a function`.

- [ ] **Step 3: Write it**

Add to `fe/src/modules/directory/browse.ts`:

```ts
/**
 * Everything the public directory is allowed to list.
 *
 * A race reaches the chain one transaction before its distances do, and its
 * entries are opened by a later one still. In between it is a real event with a
 * real id and nothing anybody can do with it, and until now the grid listed it:
 * only `pickFeatured` and the "hide full races" filter ever looked at status.
 *
 * Applied where the summaries enter the page rather than inside the filters, so
 * that search, ordering and the featured row all see the same list. A filter
 * can be switched off; this cannot.
 *
 * Closed, Completed and Cancelled all stay. Somebody who paid has a reason to
 * find the page again, and a cancelled race is exactly the one a runner most
 * needs to be able to reach.
 */
export function publicEvents(summaries: readonly EventSummary[]): EventSummary[] {
  return summaries.filter(({ event }) => event.status !== "Draft");
}
```

`EventSummary` is already imported in this file; if not, add
`import type { EventSummary } from "@/lib/events";`.

- [ ] **Step 4: Run it and watch it pass**

```bash
pnpm --filter fe test test/browse.test.ts
```

Expected: PASS.

- [ ] **Step 5: Use it on the page**

In `fe/src/modules/directory/Directory.tsx`, change line 72 and add the import:

```tsx
import { publicEvents } from "./browse";
```

```tsx
  const summaries = publicEvents(data?.events ?? []);
```

- [ ] **Step 6: Run the directory tests**

```bash
pnpm --filter fe test test/Directory.test.tsx test/browse.test.ts test/filters.test.ts
```

Expected: PASS. If a Directory test seeded a `Draft` event and expected to see it, that expectation
was asserting the bug — change the fixture's status to `Open`.

- [ ] **Step 7: Commit**

```bash
git add fe/src/modules/directory/browse.ts fe/src/modules/directory/Directory.tsx fe/test/browse.test.ts
git commit -m "fe: keep races that are not open out of the public directory (STE-17)"
```

---

## Task 3: the wizard survives a refresh

**Files:**
- Create: `fe/src/lib/run-progress.ts`
- Create: `fe/test/run-progress.test.ts`
- Modify: `fe/src/hooks/useEventRun.ts`

**Interfaces:**
- Produces: `loadRunProgress(key)`, `saveRunProgress(key, progress)`, `clearRunProgress(key)`,
  `type RunProgress = { eventId: number | null; done: string[] }`.

**Why this is here:** a refresh in the middle of the signing run empties the form. If the first
transaction already landed, the event exists on chain with its name and date permanent, no
distances, and — until the per-race console ships — no way to open it from the web app at all.

- [ ] **Step 1: Write the failing test**

Create `fe/test/run-progress.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearRunProgress, loadRunProgress, saveRunProgress } from "@/lib/run-progress";

const KEY = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";

describe("run progress", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  describe("positive", () => {
    it("gives back what was saved", () => {
      saveRunProgress(KEY, { eventId: 7, done: ["create", "category:5K"] });

      expect(loadRunProgress(KEY)).toEqual({ eventId: 7, done: ["create", "category:5K"] });
    });

    it("forgets a run once it is cleared", () => {
      saveRunProgress(KEY, { eventId: 7, done: ["create"] });
      clearRunProgress(KEY);

      expect(loadRunProgress(KEY)).toBeNull();
    });

    it("keeps one run per wallet", () => {
      const other = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";
      saveRunProgress(KEY, { eventId: 1, done: ["create"] });
      saveRunProgress(other, { eventId: 2, done: [] });

      expect(loadRunProgress(KEY)?.eventId).toBe(1);
      expect(loadRunProgress(other)?.eventId).toBe(2);
    });
  });

  describe("negative", () => {
    it("returns null when nothing was saved", () => {
      expect(loadRunProgress(KEY)).toBeNull();
    });

    it("returns null rather than throwing on a value that is not JSON", () => {
      window.localStorage.setItem(`sterun.run.${KEY}`, "{not json");

      expect(loadRunProgress(KEY)).toBeNull();
    });

    it("returns null on JSON of the wrong shape", () => {
      // Written by an older version of this app, or by hand. A half-understood
      // object is more dangerous than no object: it would resume a run into
      // steps that do not exist.
      window.localStorage.setItem(`sterun.run.${KEY}`, JSON.stringify({ eventId: "seven" }));

      expect(loadRunProgress(KEY)).toBeNull();
    });
  });

  describe("edge", () => {
    it("survives storage being unavailable", () => {
      // Private windows and blocked site data both throw on access rather than
      // returning nothing. Losing the progress is acceptable; taking the wizard
      // down with it is not.
      vi.stubGlobal("localStorage", {
        getItem() {
          throw new Error("denied");
        },
        setItem() {
          throw new Error("denied");
        },
        removeItem() {
          throw new Error("denied");
        },
      });

      expect(() => saveRunProgress(KEY, { eventId: 1, done: [] })).not.toThrow();
      expect(loadRunProgress(KEY)).toBeNull();
      expect(() => clearRunProgress(KEY)).not.toThrow();
    });

    it("accepts a run that has an id but no completed steps yet", () => {
      saveRunProgress(KEY, { eventId: 3, done: [] });

      expect(loadRunProgress(KEY)).toEqual({ eventId: 3, done: [] });
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter fe test test/run-progress.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/run-progress"`.

- [ ] **Step 3: Write it**

Create `fe/src/lib/run-progress.ts`:

```ts
/**
 * Where a half-finished publish lives between page loads.
 *
 * Publishing a race is several transactions — create, one per distance, one per
 * add-on, open — and until now the record of which had landed lived only in
 * React state. A refresh emptied it. That is worse than losing a form, because
 * the first transaction has already put the event on chain with a permanent
 * name and date: starting again publishes a second one and leaves the first
 * stranded with no entries.
 *
 * Keyed by wallet, because the run belongs to the organiser rather than to the
 * tab, and one person may hold two.
 *
 * This is not a "saved draft" and must never be presented as one. There is
 * nothing here to edit: by the time it exists the details are already on chain.
 * It is the difference between the wizard losing somebody's work and not.
 *
 * Every access is wrapped. `localStorage` throws rather than returning nothing
 * in a private window or with site data blocked, and a wizard that cannot start
 * because of that would be a worse bug than the one this fixes.
 */
export interface RunProgress {
  /** The event this run created, once `create_event` has landed. */
  eventId: number | null;
  /** Step ids that have landed, in the wizard's own vocabulary. */
  done: string[];
}

const PREFIX = "sterun.run.";

function isProgress(value: unknown): value is RunProgress {
  if (typeof value !== "object" || value === null) return false;
  const { eventId, done } = value as Record<string, unknown>;
  const idOk = eventId === null || (typeof eventId === "number" && Number.isInteger(eventId));
  const doneOk = Array.isArray(done) && done.every((step) => typeof step === "string");
  return idOk && doneOk;
}

export function loadRunProgress(address: string): RunProgress | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + address);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isProgress(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveRunProgress(address: string, progress: RunProgress): void {
  try {
    window.localStorage.setItem(PREFIX + address, JSON.stringify(progress));
  } catch {
    // Nothing to do and nothing to say: the run carries on in memory exactly
    // as it did before this file existed.
  }
}

export function clearRunProgress(address: string): void {
  try {
    window.localStorage.removeItem(PREFIX + address);
  } catch {
    // As above.
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
pnpm --filter fe test test/run-progress.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Wire it into the run**

In `fe/src/hooks/useEventRun.ts`:

1. Add the import and the wallet address:

```ts
import { clearRunProgress, loadRunProgress, saveRunProgress } from "@/lib/run-progress";
import { useWallet } from "./useWallet";
```

2. Where the hook initialises `eventId` and `done`, seed them from storage once:

```ts
  const { address } = useWallet();
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current || !address) return;
    restored.current = true;
    const saved = loadRunProgress(address);
    if (!saved) return;
    if (saved.eventId !== null) setEventId(saved.eventId);
    if (saved.done.length > 0) setDone(saved.done);
  }, [address]);
```

3. After each step lands — in the loop in `start()`, immediately after `landed.push(step.id)` (or
   wherever the completed list is updated) — record it:

```ts
        if (address) saveRunProgress(address, { eventId: state.eventId, done: [...landed] });
```

4. When the run finishes every step, forget it:

```ts
      if (address) clearRunProgress(address);
```

Use the names already in the file for the `eventId` / `done` setters; do not rename them.

- [ ] **Step 6: Prove it with a test**

Add to `fe/test/run.test.ts` (or create `fe/test/useEventRun.test.ts` if `run.test.ts` covers the
pure step list rather than the hook):

```ts
  it("picks a half-finished run back up instead of publishing a second race", async () => {
    // The bug this replaces: a refresh after `create_event` landed started the
    // wizard at step one, which created another event and left the first with
    // no distances and no way to open it.
    saveRunProgress(WALLET, { eventId: 12, done: ["create"] });

    const { result } = renderHook(() => useEventRun(/* the same arguments the other tests pass */), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.eventId).toBe(12));
    expect(result.current.done).toContain("create");
  });
```

Match the hook's real argument list and the existing test file's wrapper; copy both from the
neighbouring test rather than inventing them.

- [ ] **Step 7: Run the suite**

```bash
pnpm --filter fe test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add fe/src/lib/run-progress.ts fe/test/run-progress.test.ts fe/src/hooks/useEventRun.ts fe/test
git commit -m "fe: stop a refresh from stranding a half-published race (STE-17)"
```

---

## Task 4: the console shell

**Files:**
- Create: `fe/src/modules/organiser/component/ConsoleSidebar.tsx`
- Create: `fe/src/modules/organiser/component/ConsoleHeader.tsx`
- Create: `fe/app/(organiser)/org/layout.tsx`
- Create: `fe/test/ConsoleSidebar.test.tsx`
- Modify: `fe/src/modules/organiser/OrganiserHome.tsx` (drop its own `<h1>` and page padding)

**Interfaces:**
- Consumes: `useEvents()` from `@/hooks/useEvents`, `useWallet()` from `@/hooks/useWallet`.
- Produces: `<ConsoleSidebar />`, and `<ConsoleHeader title action?>` where `action` is a
  `ReactNode` rendered at the right of the header.

- [ ] **Step 1: Write the failing test**

Create `fe/test/ConsoleSidebar.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConsoleSidebar } from "@/modules/organiser/component/ConsoleSidebar";
import type { EventSummary } from "@/lib/events";
import type { EventStatus, SterunEvent } from "@sterunxyz/sdk";

const listEvents = vi.hoisted(() => vi.fn());
vi.mock("@/lib/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/events")>()),
  listEvents,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/org" }));

const MINE = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";
const THEIRS = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";

function summary(eventId: number, overrides: Partial<SterunEvent> = {}): EventSummary {
  return {
    event: {
      eventId,
      organiser: MINE,
      name: `Race ${eventId}`,
      metadataHash: "a".repeat(64),
      uri: "",
      startsAt: 1_790_548_200n,
      status: "Open" as EventStatus,
      ...overrides,
    },
    categories: [],
  };
}

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("ConsoleSidebar", () => {
  describe("positive", () => {
    it("offers Dashboard and Events", async () => {
      listEvents.mockResolvedValue({ events: [], unreadable: [] });

      render(<ConsoleSidebar address={MINE} />, { wrapper: Wrapper });

      expect(await screen.findByRole("link", { name: "Dashboard" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /events/i })).toBeInTheDocument();
    });

    it("lists this wallet's races under Events once it is expanded", async () => {
      listEvents.mockResolvedValue({ events: [summary(1), summary(2)], unreadable: [] });

      render(<ConsoleSidebar address={MINE} />, { wrapper: Wrapper });
      await userEvent.click(await screen.findByRole("button", { name: /events/i }));

      expect(screen.getByRole("link", { name: "Race 1" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Race 2" })).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("does not list races another wallet organises", async () => {
      listEvents.mockResolvedValue({
        events: [summary(1), summary(2, { organiser: THEIRS })],
        unreadable: [],
      });

      render(<ConsoleSidebar address={MINE} />, { wrapper: Wrapper });
      await userEvent.click(await screen.findByRole("button", { name: /events/i }));

      expect(screen.getByRole("link", { name: "Race 1" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Race 2" })).not.toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("still offers Events when the chain cannot be read", async () => {
      // The rail is navigation. A node that will not answer must not remove the
      // way back to the dashboard.
      listEvents.mockRejectedValue(new Error("rpc down"));

      render(<ConsoleSidebar address={MINE} />, { wrapper: Wrapper });

      expect(await screen.findByRole("link", { name: "Dashboard" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /events/i })).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter fe test test/ConsoleSidebar.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the sidebar**

Create `fe/src/modules/organiser/component/ConsoleSidebar.tsx`:

```tsx
"use client";

/**
 * The console's rail.
 *
 * Two items, and the second is an expander rather than a page: `Events` opens
 * into this wallet's races so somebody can move between them without going back
 * through a list. There is deliberately no "all races" page behind it — the
 * dashboard already holds that table, and a second one would be the same list
 * twice.
 *
 * Everything race-scoped — entries, scanners, results — lives inside a race, not
 * here. A rail item that has to ask "of which race?" belongs in the race.
 */
import { ChevronDownIcon, ChevronRightIcon, LayoutDashboardIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { useEvents } from "@/hooks/useEvents";

export function ConsoleSidebar({ address }: { address: string }) {
  const pathname = usePathname();
  const { data } = useEvents();
  const [open, setOpen] = useState(true);

  const mine = data?.events.filter(({ event }) => event.organiser === address) ?? [];

  return (
    <aside className="flex w-52 flex-col gap-1 bg-ink px-2.5 py-4 text-n-300">
      <span className="px-3 pb-5 text-sm font-semibold tracking-[0.14em] text-paper">STERUN</span>

      <Link
        href="/org"
        aria-current={pathname === "/org" ? "page" : undefined}
        className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-white/10 aria-[current=page]:bg-teal aria-[current=page]:font-medium aria-[current=page]:text-paper"
      >
        <LayoutDashboardIcon aria-hidden className="size-4" />
        Dashboard
      </Link>

      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-white/10"
      >
        {open ? (
          <ChevronDownIcon aria-hidden className="size-4" />
        ) : (
          <ChevronRightIcon aria-hidden className="size-4" />
        )}
        Events
      </button>

      {open ? (
        <ul className="flex flex-col gap-0.5">
          {mine.map(({ event }) => {
            const href = `/org/events/${event.eventId}`;
            return (
              <li key={event.eventId}>
                <Link
                  href={href}
                  aria-current={pathname === href ? "page" : undefined}
                  className="block rounded-md py-1.5 pl-9 pr-2.5 text-sm hover:bg-white/10 aria-[current=page]:bg-teal aria-[current=page]:font-medium aria-[current=page]:text-paper"
                >
                  {event.name}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </aside>
  );
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
pnpm --filter fe test test/ConsoleSidebar.test.tsx
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Write the header**

Create `fe/src/modules/organiser/component/ConsoleHeader.tsx`:

```tsx
/**
 * Every console page's top bar: what you are looking at, and the one thing you
 * can do to it.
 *
 * One action, not a row of them. The tabs inside a race each have exactly one —
 * download the roster, add a scanner, record the results — and putting it here
 * rather than under the content means it does not travel down the page as a
 * table grows.
 */
import type { ReactNode } from "react";

export function ConsoleHeader({
  title,
  badge,
  action,
  bell,
}: {
  title: string;
  badge?: ReactNode;
  action?: ReactNode;
  bell?: ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-n-200 bg-paper px-6 py-4">
      <h1 className="heading-strong text-xl text-ink">
        {title}
        {badge ? <span className="ml-2 align-middle">{badge}</span> : null}
      </h1>
      <div className="flex items-center gap-2.5">
        {bell}
        {action}
      </div>
    </header>
  );
}
```

- [ ] **Step 6: Write the layout**

Create `fe/app/(organiser)/org/layout.tsx`:

```tsx
/**
 * The shell every organiser page sits in.
 *
 * A layout rather than a wrapper each page imports, so the rail does not
 * remount when somebody moves between races: its expander stays open and its
 * scroll position stays put, which is the whole reason for having it.
 *
 * `WalletGate` lives here too. Every page below needs to know which wallet is
 * asking before it can show anything at all.
 */
import type { ReactNode } from "react";

import { WalletGate } from "@/components/layouts/WalletGate";

import { ConsoleFrame } from "@/modules/organiser/component/ConsoleFrame";

export default function OrganiserLayout({ children }: { children: ReactNode }) {
  return (
    <WalletGate>
      <ConsoleFrame>{children}</ConsoleFrame>
    </WalletGate>
  );
}
```

And `fe/src/modules/organiser/component/ConsoleFrame.tsx`, which is the client half that can read
the wallet:

```tsx
"use client";

/**
 * The rail plus the page. Split from the layout because the layout is a server
 * component and the rail needs the connected wallet.
 */
import type { ReactNode } from "react";

import { useWallet } from "@/hooks/useWallet";

import { ConsoleSidebar } from "./ConsoleSidebar";

export function ConsoleFrame({ children }: { children: ReactNode }) {
  const { address } = useWallet();

  // WalletGate has already established there is one; this is for the types.
  if (!address) return null;

  return (
    <div className="flex min-h-[calc(100dvh-var(--header-height,0px))] w-full">
      <ConsoleSidebar address={address} />
      <div className="flex min-w-0 flex-1 flex-col bg-n-50">{children}</div>
    </div>
  );
}
```

- [ ] **Step 7: Take the gate and the heading off the page**

In `fe/src/modules/organiser/OrganiserHome.tsx`, delete the `<WalletGate>` wrapper (the layout owns
it now) and the `<header>` block with the `<h1>` and the lead paragraph. Export the inner `Console`
component as `OrganiserHome`. Leave everything else for Task 7.

- [ ] **Step 8: Run the suite and look at it**

```bash
pnpm --filter fe test
pnpm --filter fe dev
```

Open `http://localhost:3000/org` with a wallet connected. Expected: the dark rail on the left,
Dashboard highlighted, Events expanding into the wallet's races.

- [ ] **Step 9: Commit**

```bash
git add fe/app/\(organiser\)/org/layout.tsx fe/src/modules/organiser/component/ fe/src/modules/organiser/OrganiserHome.tsx fe/test/ConsoleSidebar.test.tsx
git commit -m "fe: put the organiser console in a shell with a rail (STE-17)"
```

---

## Task 5: what needs the organiser

**Files:**
- Create: `fe/src/modules/organiser/needs.ts`
- Create: `fe/test/needs.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type NeedKind = "scanner" | "open" | "results";
  interface Need {
    kind: NeedKind;
    eventId: number;
    eventName: string;
    urgent: boolean;
    title: string;   // "Add a scanner — Fun Run Sleman"
    detail: string;  // "Runs in 3 days. Nobody can check runners in."
    action: string;  // the button's words
    href: string;
  }
  function racesToAskAboutScanners(events, nowS): number[];
  function racesToAskAboutResults(events, nowS): number[];
  function buildNeeds(input: NeedsInput): Need[];
  ```

- [ ] **Step 1: Write the failing test**

Create `fe/test/needs.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  buildNeeds,
  racesToAskAboutResults,
  racesToAskAboutScanners,
} from "@/modules/organiser/needs";
import type { EventSummary } from "@/lib/events";
import type { EventStatus, SterunEvent } from "@sterunxyz/sdk";

const NOW = 1_800_000_000n;
const DAY = 86_400n;

function summary(eventId: number, overrides: Partial<SterunEvent> = {}): EventSummary {
  return {
    event: {
      eventId,
      organiser: "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN",
      name: `Race ${eventId}`,
      metadataHash: "a".repeat(64),
      uri: "",
      startsAt: NOW + 30n * DAY,
      status: "Open" as EventStatus,
      ...overrides,
    },
    categories: [],
  };
}

const NOTHING = { scannerCounts: new Map<number, number>(), resultCounts: new Map<number, number>() };

describe("racesToAskAboutScanners", () => {
  describe("positive", () => {
    it("asks about a race inside the window", () => {
      const soon = summary(1, { startsAt: NOW + 5n * DAY });

      expect(racesToAskAboutScanners([soon], NOW)).toEqual([1]);
    });
  });

  describe("negative", () => {
    it("does not ask about a race two months out", () => {
      // Bounded on purpose: this is one request per race and an organiser with
      // a year of races would pay for all of them on every page load.
      expect(racesToAskAboutScanners([summary(1, { startsAt: NOW + 60n * DAY })], NOW)).toEqual([]);
    });

    it("does not ask about a race that has already run", () => {
      expect(racesToAskAboutScanners([summary(1, { startsAt: NOW - DAY })], NOW)).toEqual([]);
    });

    it("does not ask about a race whose entries are not open", () => {
      const notOpen = summary(1, { startsAt: NOW + 5n * DAY, status: "Draft" });

      expect(racesToAskAboutScanners([notOpen], NOW)).toEqual([]);
    });

    it("does not ask about a cancelled race", () => {
      const off = summary(1, { startsAt: NOW + 5n * DAY, status: "Cancelled" });

      expect(racesToAskAboutScanners([off], NOW)).toEqual([]);
    });
  });

  describe("edge", () => {
    it("asks about a race exactly on the window's edge", () => {
      expect(racesToAskAboutScanners([summary(1, { startsAt: NOW + 14n * DAY })], NOW)).toEqual([1]);
    });

    it("asks about a race whose entries have closed but which still has to be run", () => {
      // Entries closing is the normal state a week before a race. It is the
      // moment a missing scanner matters most.
      const closed = summary(1, { startsAt: NOW + 3n * DAY, status: "Closed" });

      expect(racesToAskAboutScanners([closed], NOW)).toEqual([1]);
    });
  });
});

describe("racesToAskAboutResults", () => {
  it("asks about a race that ran yesterday", () => {
    expect(racesToAskAboutResults([summary(1, { startsAt: NOW - DAY })], NOW)).toEqual([1]);
  });

  it("does not ask about a race that has not run", () => {
    expect(racesToAskAboutResults([summary(1, { startsAt: NOW + DAY })], NOW)).toEqual([]);
  });

  it("does not ask about a cancelled race", () => {
    const off = summary(1, { startsAt: NOW - DAY, status: "Cancelled" });

    expect(racesToAskAboutResults([off], NOW)).toEqual([]);
  });
});

describe("buildNeeds", () => {
  describe("positive", () => {
    it("asks for a scanner when a race is days away and has none", () => {
      const soon = summary(1, { startsAt: NOW + 3n * DAY, name: "Fun Run Sleman" });

      const [need] = buildNeeds({
        events: [soon],
        nowS: NOW,
        scannerCounts: new Map([[1, 0]]),
        resultCounts: new Map(),
      });

      expect(need.kind).toBe("scanner");
      expect(need.urgent).toBe(true);
      expect(need.title).toBe("Add a scanner — Fun Run Sleman");
      expect(need.detail).toBe("Runs in 3 days. Nobody can check runners in.");
      expect(need.href).toBe("/org/events/1?tab=scanners");
    });

    it("asks for entries to be opened on a race that is not open", () => {
      const [need] = buildNeeds({ events: [summary(1, { status: "Draft" })], nowS: NOW, ...NOTHING });

      expect(need.kind).toBe("open");
      expect(need.urgent).toBe(false);
      expect(need.action).toBe("Open entries");
    });

    it("asks for results on a race that ran with none recorded", () => {
      const ran = summary(1, { startsAt: NOW - 12n * DAY });

      const [need] = buildNeeds({
        events: [ran],
        nowS: NOW,
        scannerCounts: new Map(),
        resultCounts: new Map([[1, 0]]),
      });

      expect(need.kind).toBe("results");
      expect(need.detail).toBe("Finished 12 days ago with no results.");
    });
  });

  describe("negative", () => {
    it("says nothing about a race that already has a scanner", () => {
      const soon = summary(1, { startsAt: NOW + 3n * DAY });

      expect(
        buildNeeds({ events: [soon], nowS: NOW, scannerCounts: new Map([[1, 2]]), resultCounts: new Map() }),
      ).toEqual([]);
    });

    it("says nothing about a race whose results are in", () => {
      const ran = summary(1, { startsAt: NOW - 2n * DAY });

      expect(
        buildNeeds({ events: [ran], nowS: NOW, scannerCounts: new Map(), resultCounts: new Map([[1, 40]]) }),
      ).toEqual([]);
    });

    it("says nothing when the scanner count has not arrived yet", () => {
      // An unanswered request is not an answer of zero. Claiming a race has no
      // scanner because a node was slow would send somebody to add one they
      // already have.
      const soon = summary(1, { startsAt: NOW + 3n * DAY });

      expect(buildNeeds({ events: [soon], nowS: NOW, ...NOTHING })).toEqual([]);
    });

    it("says nothing about a cancelled race, whatever else is missing", () => {
      const off = summary(1, { startsAt: NOW - 2n * DAY, status: "Cancelled" });

      expect(
        buildNeeds({ events: [off], nowS: NOW, scannerCounts: new Map([[1, 0]]), resultCounts: new Map([[1, 0]]) }),
      ).toEqual([]);
    });
  });

  describe("edge", () => {
    it("puts the urgent one first, then the soonest race", () => {
      const urgent = summary(1, { startsAt: NOW + 2n * DAY });
      const later = summary(2, { startsAt: NOW + 40n * DAY, status: "Draft" });
      const ran = summary(3, { startsAt: NOW - 5n * DAY });

      const needs = buildNeeds({
        events: [later, ran, urgent],
        nowS: NOW,
        scannerCounts: new Map([[1, 0]]),
        resultCounts: new Map([[3, 0]]),
      });

      expect(needs.map((need) => need.kind)).toEqual(["scanner", "results", "open"]);
    });

    it("stops calling a missing scanner urgent once the race is far enough away", () => {
      // Urgency is about how long there is to act, not about the size of the
      // problem. Ten days out this is a note; two days out it is a banner.
      const soon = summary(1, { startsAt: NOW + 10n * DAY });

      const [need] = buildNeeds({
        events: [soon],
        nowS: NOW,
        scannerCounts: new Map([[1, 0]]),
        resultCounts: new Map(),
      });

      expect(need.urgent).toBe(false);
    });

    it("says 'Runs tomorrow' rather than 'in 1 days'", () => {
      const soon = summary(1, { startsAt: NOW + 1n * DAY });

      const [need] = buildNeeds({
        events: [soon],
        nowS: NOW,
        scannerCounts: new Map([[1, 0]]),
        resultCounts: new Map(),
      });

      expect(need.detail).toBe("Runs tomorrow. Nobody can check runners in.");
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter fe test test/needs.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write it**

Create `fe/src/modules/organiser/needs.ts`:

```ts
/**
 * What is waiting on the organiser, worked out rather than announced.
 *
 * Three things can be waiting, and only one of them can hurt:
 *
 *   scanner  a race is days away and no device is allowed to check anyone in.
 *            Nobody finds out until people are queuing at the gate.
 *   open     a race exists but its entries are not open, so nobody can find it.
 *   results  a race has been run and nothing has been recorded against it.
 *
 * Two rules keep this honest. **A missing answer is never a finding**: an
 * unanswered request for a scanner list is not a race with no scanner, and
 * treating it as one sends somebody to fix what is not broken. And **urgency is
 * about how long there is to act**, not about how bad the problem is — the same
 * missing scanner is a note three weeks out and an interruption three days out.
 *
 * A cancelled race needs nothing. There is no race to check anyone into and no
 * result to record.
 */
import type { EventSummary } from "@/lib/events";

const DAY = 86_400n;

/** How far ahead a race is worth asking about. One request per race. */
const SCANNER_WINDOW_DAYS = 14n;

/** Inside this, a missing scanner stops being a note and interrupts. */
const URGENT_DAYS = 7n;

export type NeedKind = "scanner" | "open" | "results";

export interface Need {
  kind: NeedKind;
  eventId: number;
  eventName: string;
  urgent: boolean;
  title: string;
  detail: string;
  action: string;
  href: string;
}

export interface NeedsInput {
  events: readonly EventSummary[];
  nowS: bigint;
  /** Only for races that were asked about; a missing key means "not answered". */
  scannerCounts: ReadonlyMap<number, number>;
  /** Recorded finishes and DNFs. A missing key means "not answered". */
  resultCounts: ReadonlyMap<number, number>;
}

function daysUntil(startsAt: bigint, nowS: bigint): bigint {
  return (startsAt - nowS) / DAY;
}

function daysSince(startsAt: bigint, nowS: bigint): bigint {
  return (nowS - startsAt) / DAY;
}

function inDays(days: bigint): string {
  if (days <= 0n) return "Runs today";
  if (days === 1n) return "Runs tomorrow";
  return `Runs in ${days} days`;
}

function agoDays(days: bigint): string {
  if (days <= 0n) return "Finished today";
  if (days === 1n) return "Finished yesterday";
  return `Finished ${days} days ago`;
}

/**
 * Races whose scanner list is worth a request: still to be run, inside the
 * window, and not cancelled. Entries being closed does not exclude one — that
 * is the normal state of a race the week before it runs.
 */
export function racesToAskAboutScanners(
  events: readonly EventSummary[],
  nowS: bigint,
): number[] {
  return events
    .filter(({ event }) => {
      if (event.status === "Cancelled" || event.status === "Draft") return false;
      if (event.startsAt <= nowS) return false;
      return daysUntil(event.startsAt, nowS) <= SCANNER_WINDOW_DAYS;
    })
    .map(({ event }) => event.eventId);
}

/** Races that have already been run and could be missing their results. */
export function racesToAskAboutResults(
  events: readonly EventSummary[],
  nowS: bigint,
): number[] {
  return events
    .filter(({ event }) => event.status !== "Cancelled" && event.startsAt < nowS)
    .map(({ event }) => event.eventId);
}

export function buildNeeds({ events, nowS, scannerCounts, resultCounts }: NeedsInput): Need[] {
  const needs: Need[] = [];

  for (const { event } of events) {
    if (event.status === "Cancelled") continue;

    if (event.status === "Draft") {
      needs.push({
        kind: "open",
        eventId: event.eventId,
        eventName: event.name,
        urgent: false,
        title: `Open entries — ${event.name}`,
        detail: "Nobody can find this race or enter it.",
        action: "Open entries",
        href: `/org/events/${event.eventId}`,
      });
      continue;
    }

    if (event.startsAt > nowS) {
      const scanners = scannerCounts.get(event.eventId);
      if (scanners === 0) {
        const days = daysUntil(event.startsAt, nowS);
        needs.push({
          kind: "scanner",
          eventId: event.eventId,
          eventName: event.name,
          urgent: days <= URGENT_DAYS,
          title: `Add a scanner — ${event.name}`,
          detail: `${inDays(days)}. Nobody can check runners in.`,
          action: "Add a scanner",
          href: `/org/events/${event.eventId}?tab=scanners`,
        });
      }
      continue;
    }

    const results = resultCounts.get(event.eventId);
    if (results === 0) {
      needs.push({
        kind: "results",
        eventId: event.eventId,
        eventName: event.name,
        urgent: false,
        title: `Upload results — ${event.name}`,
        detail: `${agoDays(daysSince(event.startsAt, nowS))} with no results.`,
        action: "Upload results",
        href: `/org/events/${event.eventId}?tab=results`,
      });
    }
  }

  const startsAt = new Map(events.map(({ event }) => [event.eventId, event.startsAt]));
  return needs.sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    const left = startsAt.get(a.eventId) ?? 0n;
    const right = startsAt.get(b.eventId) ?? 0n;
    return left === right ? a.eventId - b.eventId : left < right ? -1 : 1;
  });
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
pnpm --filter fe test test/needs.test.ts
```

Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add fe/src/modules/organiser/needs.ts fe/test/needs.test.ts
git commit -m "fe: work out what is waiting on the organiser (STE-17)"
```

---

## Task 6: the counts the needs are built from

**Files:**
- Create: `fe/src/hooks/useScannerCounts.ts`
- Create: `fe/src/hooks/useRaceRecords.ts`
- Create: `fe/src/lib/records.ts`
- Create: `fe/test/records.test.ts`

**Interfaces:**
- Consumes: `apiFetch` from `@/lib/api`, `racesToAskAboutScanners` from Task 5.
- Produces:
  ```ts
  interface IndexedRecord {
    tokenId: number; eventId: number; categoryId: number; bibNo: number;
    runnerAddress: string; state: "Entered" | "RacepackClaimed" | "Finished" | "Dnf";
    enteredAt: bigint; claimedAt: bigint | null; finishTimeS: number | null;
  }
  function fetchEventRecords(eventId: number): Promise<IndexedRecord[]>;
  function useRaceRecords(eventIds: readonly number[]): Map<number, IndexedRecord[]>;
  function useScannerCounts(eventIds: readonly number[]): Map<number, number>;
  function entriesPerDay(records, nowS, days): number[];
  function finishedCount(records): number;
  ```

- [ ] **Step 1: Write the failing test**

Create `fe/test/records.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { entriesPerDay, finishedCount, type IndexedRecord } from "@/lib/records";

const NOW = 1_800_000_000n;
const DAY = 86_400n;

function record(overrides: Partial<IndexedRecord> = {}): IndexedRecord {
  return {
    tokenId: 1,
    eventId: 1,
    categoryId: 0,
    bibNo: 1001,
    runnerAddress: "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN",
    state: "Entered",
    enteredAt: NOW,
    claimedAt: null,
    finishTimeS: null,
    ...overrides,
  };
}

describe("entriesPerDay", () => {
  describe("positive", () => {
    it("counts today's entries in the last bucket", () => {
      const days = entriesPerDay([record({ enteredAt: NOW })], NOW, 3);

      expect(days).toEqual([0, 0, 1]);
    });

    it("counts an entry from two days ago in the first bucket", () => {
      const days = entriesPerDay([record({ enteredAt: NOW - 2n * DAY })], NOW, 3);

      expect(days).toEqual([1, 0, 0]);
    });

    it("adds entries that fall on the same day", () => {
      const days = entriesPerDay(
        [record({ enteredAt: NOW }), record({ tokenId: 2, enteredAt: NOW - 3_600n })],
        NOW,
        2,
      );

      expect(days).toEqual([0, 2]);
    });
  });

  describe("negative", () => {
    it("ignores an entry older than the window", () => {
      expect(entriesPerDay([record({ enteredAt: NOW - 40n * DAY })], NOW, 14)).toEqual(
        Array(14).fill(0),
      );
    });

    it("ignores an entry dated in the future", () => {
      // A clock that disagrees with the chain's, or a record from a node ahead
      // of this browser. It must not land outside the array.
      expect(entriesPerDay([record({ enteredAt: NOW + 5n * DAY })], NOW, 3)).toEqual([0, 0, 0]);
    });
  });

  describe("edge", () => {
    it("returns a zero for every day when there are no records", () => {
      expect(entriesPerDay([], NOW, 14)).toEqual(Array(14).fill(0));
    });

    it("returns an empty array for a window of zero days", () => {
      expect(entriesPerDay([record()], NOW, 0)).toEqual([]);
    });
  });
});

describe("finishedCount", () => {
  it("counts finishes and DNFs, because both are a recorded result", () => {
    const records = [
      record({ tokenId: 1, state: "Finished", finishTimeS: 3_134 }),
      record({ tokenId: 2, state: "Finished", finishTimeS: null }),
      record({ tokenId: 3, state: "Dnf" }),
      record({ tokenId: 4, state: "Entered" }),
      record({ tokenId: 5, state: "RacepackClaimed" }),
    ];

    expect(finishedCount(records)).toBe(3);
  });

  it("counts a finish with no official time, which is a normal fun-run row", () => {
    // STE-41. `finishTimeS === null` means "finished, no official time" and is
    // never a zero-second race.
    expect(finishedCount([record({ state: "Finished", finishTimeS: null })])).toBe(1);
  });

  it("is zero for a race nobody has finished", () => {
    expect(finishedCount([record({ state: "Entered" })])).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter fe test test/records.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `records.ts`**

Create `fe/src/lib/records.ts`:

```ts
/**
 * Entries as the indexer hands them over, and the sums drawn from them.
 *
 * The chain knows how many people have entered a race. It does not usefully
 * know *when* each of them did: Soroban keeps its events for days, so anything
 * about a trend has to come from the index, which keeps them (`be/CLAUDE.md`).
 * That is the whole reason this file exists and the reason the sums here are
 * pure — a chart nobody can test is a chart nobody can trust.
 *
 * Numbers on the wire are strings where they are u64 or i128, because a JSON
 * number is a double and these are timestamps and money.
 */
import { apiFetch } from "@/lib/api";

export type RecordState = "Entered" | "RacepackClaimed" | "Finished" | "Dnf";

export interface IndexedRecord {
  tokenId: number;
  eventId: number;
  categoryId: number;
  bibNo: number;
  runnerAddress: string;
  state: RecordState;
  enteredAt: bigint;
  claimedAt: bigint | null;
  /** `null` is "finished, no official time" (STE-41). Never render it as 0. */
  finishTimeS: number | null;
}

interface RecordJson {
  token_id: number;
  event_id: number;
  category_id: number;
  bib_no: number;
  runner_address: string;
  state: RecordState;
  entered_at: string;
  claimed_at: string | null;
  finish_time_s: number | null;
}

const PAGE = 200;

function toRecord(row: RecordJson): IndexedRecord {
  return {
    tokenId: row.token_id,
    eventId: row.event_id,
    categoryId: row.category_id,
    bibNo: row.bib_no,
    runnerAddress: row.runner_address,
    state: row.state,
    enteredAt: BigInt(row.entered_at),
    claimedAt: row.claimed_at === null ? null : BigInt(row.claimed_at),
    finishTimeS: row.finish_time_s,
  };
}

/**
 * Every entry in a race, paged out.
 *
 * The endpoint caps a page at 200 and a race can hold more, so this asks until
 * a short page comes back. The loop is bounded by the offset growing, so a
 * server that kept answering with a full page would stop at the cap rather than
 * run forever.
 */
export async function fetchEventRecords(eventId: number): Promise<IndexedRecord[]> {
  const all: IndexedRecord[] = [];
  for (let offset = 0; offset < 10_000; offset += PAGE) {
    const body = await apiFetch<{ records: RecordJson[]; count: number }>(
      `/events/${eventId}/records?limit=${PAGE}&offset=${offset}`,
    );
    all.push(...body.records.map(toRecord));
    if (body.records.length < PAGE) break;
  }
  return all;
}

const DAY = 86_400n;

/**
 * Entries bucketed by day, oldest first, ending with today.
 *
 * Records outside the window are dropped rather than clamped into the end
 * buckets, which would draw a spike that never happened. A record dated in the
 * future is dropped for the same reason.
 */
export function entriesPerDay(
  records: readonly IndexedRecord[],
  nowS: bigint,
  days: number,
): number[] {
  const buckets = Array(Math.max(0, days)).fill(0) as number[];
  if (buckets.length === 0) return buckets;

  for (const entry of records) {
    if (entry.enteredAt > nowS) continue;
    const back = Number((nowS - entry.enteredAt) / DAY);
    const index = buckets.length - 1 - back;
    if (index >= 0) buckets[index] += 1;
  }
  return buckets;
}

/** How many entries carry a recorded result. A DNF is a result. */
export function finishedCount(records: readonly IndexedRecord[]): number {
  return records.filter((entry) => entry.state === "Finished" || entry.state === "Dnf").length;
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
pnpm --filter fe test test/records.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Write the hooks**

Create `fe/src/hooks/useRaceRecords.ts`:

```ts
"use client";

/**
 * One indexer read per race, in parallel.
 *
 * `useQueries` rather than one query over all of them, so a race whose read
 * fails leaves the others alone: the dashboard draws a sparkline per race and
 * one unreachable page should cost one line, not the page.
 */
import { useQueries } from "@tanstack/react-query";

import { fetchEventRecords, type IndexedRecord } from "@/lib/records";

const STALE_MS = 60_000;

export function useRaceRecords(eventIds: readonly number[]): Map<number, IndexedRecord[]> {
  const results = useQueries({
    queries: eventIds.map((eventId) => ({
      queryKey: ["race-records", eventId] as const,
      queryFn: () => fetchEventRecords(eventId),
      staleTime: STALE_MS,
      retry: false,
    })),
  });

  const byEvent = new Map<number, IndexedRecord[]>();
  results.forEach((result, index) => {
    // Only a resolved read is entered. An absent key means "not answered", and
    // `buildNeeds` treats that as silence rather than as a finding.
    if (result.data) byEvent.set(eventIds[index], result.data);
  });
  return byEvent;
}
```

Create `fe/src/hooks/useScannerCounts.ts`:

```ts
"use client";

/**
 * How many devices are allowed to check runners in, for the races close enough
 * that the answer matters.
 *
 * The chain cannot answer this: `is_scanner` takes an address, so enumerating
 * them means the index (`be/CLAUDE.md`). One request per race, which is why the
 * caller passes a bounded list rather than every race the wallet owns.
 */
import { useQueries } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";

interface ScannerList {
  scanners: { address: string; added_ledger: number }[];
  last_ledger: number;
}

export function fetchScanners(eventId: number): Promise<ScannerList> {
  return apiFetch<ScannerList>(`/events/${eventId}/scanners`);
}

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
    if (result.data) counts.set(eventIds[index], result.data.scanners.length);
  });
  return counts;
}
```

- [ ] **Step 6: Typecheck and run the suite**

```bash
pnpm --filter fe typecheck
pnpm --filter fe test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add fe/src/lib/records.ts fe/src/hooks/useRaceRecords.ts fe/src/hooks/useScannerCounts.ts fe/test/records.test.ts
git commit -m "fe: read entries and scanner lists out of the index (STE-17)"
```

---

## Task 7: the bell, and the one thing that still interrupts

**Files:**
- Create: `fe/src/modules/organiser/component/NeedsBell.tsx`
- Create: `fe/src/modules/organiser/component/UrgentBanner.tsx`
- Create: `fe/src/hooks/useNeeds.ts`
- Create: `fe/test/NeedsBell.test.tsx`
- Modify: `fe/src/modules/organiser/component/ConsoleFrame.tsx` (pass the bell down)

**Interfaces:**
- Consumes: `buildNeeds`, `racesToAskAboutScanners`, `racesToAskAboutResults` (Task 5);
  `useRaceRecords`, `useScannerCounts`, `finishedCount` (Task 6).
- Produces: `useNeeds(): Need[]`, `<NeedsBell needs />`, `<UrgentBanner need />`.

- [ ] **Step 1: Write the failing test**

Create `fe/test/NeedsBell.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { NeedsBell } from "@/modules/organiser/component/NeedsBell";
import type { Need } from "@/modules/organiser/needs";

function need(overrides: Partial<Need> = {}): Need {
  return {
    kind: "scanner",
    eventId: 1,
    eventName: "Fun Run Sleman",
    urgent: true,
    title: "Add a scanner — Fun Run Sleman",
    detail: "Runs in 3 days. Nobody can check runners in.",
    action: "Add a scanner",
    href: "/org/events/1?tab=scanners",
    ...overrides,
  };
}

describe("NeedsBell", () => {
  describe("positive", () => {
    it("counts what is waiting", () => {
      render(<NeedsBell needs={[need(), need({ eventId: 2, kind: "open", urgent: false })]} />);

      expect(screen.getByRole("button", { name: "2 things need you" })).toBeInTheDocument();
    });

    it("lists them once it is opened", async () => {
      render(<NeedsBell needs={[need()]} />);
      await userEvent.click(screen.getByRole("button", { name: "1 thing needs you" }));

      expect(screen.getByText("Add a scanner — Fun Run Sleman")).toBeInTheDocument();
      expect(screen.getByText("Runs in 3 days. Nobody can check runners in.")).toBeInTheDocument();
    });

    it("links each row to where the fix is", async () => {
      render(<NeedsBell needs={[need()]} />);
      await userEvent.click(screen.getByRole("button", { name: "1 thing needs you" }));

      expect(screen.getByRole("link", { name: /Add a scanner/ })).toHaveAttribute(
        "href",
        "/org/events/1?tab=scanners",
      );
    });
  });

  describe("negative", () => {
    it("says so plainly when nothing is waiting", async () => {
      render(<NeedsBell needs={[]} />);
      await userEvent.click(screen.getByRole("button", { name: "Nothing needs you" }));

      expect(screen.getByText("Nothing is waiting on you.")).toBeInTheDocument();
    });

    it("shows no count badge when nothing is waiting", () => {
      // A badge that is always there is furniture. The dot has to mean
      // something or it stops being read at all.
      const { container } = render(<NeedsBell needs={[]} />);

      expect(container.querySelector("[data-needs-count]")).toBeNull();
    });
  });

  describe("edge", () => {
    it("uses the singular for one thing", () => {
      render(<NeedsBell needs={[need()]} />);

      expect(screen.getByRole("button", { name: "1 thing needs you" })).toBeInTheDocument();
    });

    it("marks the urgent row apart from the rest", async () => {
      render(<NeedsBell needs={[need(), need({ eventId: 2, kind: "results", urgent: false })]} />);
      await userEvent.click(screen.getByRole("button", { name: "2 things need you" }));

      const rows = screen.getAllByRole("link");
      expect(rows[0]).toHaveAttribute("data-urgent", "true");
      expect(rows[1]).not.toHaveAttribute("data-urgent", "true");
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter fe test test/NeedsBell.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the bell**

Create `fe/src/modules/organiser/component/NeedsBell.tsx`:

```tsx
"use client";

/**
 * Everything waiting on the organiser, on every page.
 *
 * A panel on the dashboard could never do that: somebody three tabs deep inside
 * a race is exactly the person who has stopped looking at the dashboard. What a
 * bell costs is that it only speaks when it is clicked, which is why the one
 * case that cannot wait for a click is also drawn as a banner
 * (`UrgentBanner`) — and why that case is one case and not a policy.
 *
 * The count is only rendered when there is something to count. A badge that is
 * always lit is furniture, and furniture is not read.
 */
import { BellIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import type { Need } from "../needs";

function label(count: number): string {
  if (count === 0) return "Nothing needs you";
  return count === 1 ? "1 thing needs you" : `${count} things need you`;
}

export function NeedsBell({ needs }: { needs: readonly Need[] }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label(needs.length)}
        className="relative grid size-9 place-items-center rounded-md border border-n-300 bg-paper text-ink"
      >
        <BellIcon aria-hidden className="size-4" />
        {needs.length > 0 ? (
          <span
            data-needs-count={needs.length}
            aria-hidden
            className="absolute -right-1.5 -top-1.5 grid min-w-[1.125rem] place-items-center rounded-full border-2 border-paper bg-danger px-1 text-[0.65rem] font-semibold text-paper"
          >
            {needs.length}
          </span>
        ) : null}
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[25rem] p-4">
        <p className="heading-strong mb-3 text-sm text-ink">{label(needs.length)}</p>

        {needs.length === 0 ? (
          <p className="text-sm text-n-500">Nothing is waiting on you.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {needs.map((item) => (
              <li key={`${item.kind}-${item.eventId}`}>
                <Link
                  href={item.href}
                  data-urgent={item.urgent ? "true" : undefined}
                  className="flex items-center gap-3 rounded-md border border-n-200 px-3 py-2.5 data-[urgent=true]:border-warning-border data-[urgent=true]:bg-warning-surface"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{item.title}</span>
                    <span className="mt-0.5 block text-xs text-n-500 data-[urgent=true]:text-warning">
                      {item.detail}
                    </span>
                  </span>
                  <ChevronRightIcon aria-hidden className="ml-auto size-4 shrink-0 text-n-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
pnpm --filter fe test test/NeedsBell.test.tsx
```

Expected: PASS, 7 tests. If the popover's content is not in the document until opened, the two
tests that click first already account for it; the badge test reads the trigger only.

- [ ] **Step 5: Write the banner**

Create `fe/src/modules/organiser/component/UrgentBanner.tsx`:

```tsx
/**
 * The one thing that interrupts.
 *
 * A race days away with nobody able to check runners in is not discovered until
 * people are queuing at the gate, so it does not wait for somebody to click the
 * bell. Everything else does.
 *
 * The measure of whether this rule is still honest is how often it fires: if an
 * organiser sees this more than about once a week, it has stopped meaning
 * anything and the condition in `needs.ts` should be narrowed, not the colour
 * changed.
 */
import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";

import type { Need } from "../needs";

export function UrgentBanner({ need }: { need: Need }) {
  return (
    <div
      role="note"
      className="mb-3 flex items-center gap-3 rounded-lg border border-warning-border bg-warning-surface px-4 py-3"
    >
      <TriangleAlertIcon aria-hidden className="size-4 shrink-0 text-warning" />
      <p className="text-sm text-warning">
        <strong className="font-semibold">{need.title.split(" — ")[1]} {need.detail.split(".")[0].toLowerCase()}.</strong>{" "}
        {need.detail.split(". ").slice(1).join(". ")}
      </p>
      <Link
        href={need.href}
        className="ml-auto shrink-0 rounded-md border border-warning-border bg-paper px-3.5 py-2 text-sm font-medium text-warning"
      >
        {need.action}
      </Link>
    </div>
  );
}
```

- [ ] **Step 6: Write the hook that feeds both**

Create `fe/src/hooks/useNeeds.ts`:

```ts
"use client";

/**
 * The needs list, assembled from three reads.
 *
 * The two request lists are deliberately narrow: scanner lists only for races
 * close enough for the answer to matter, records only for races that have
 * already run. An organiser with a year of races should not pay for all of them
 * on every page load.
 */
import { useEvents } from "@/hooks/useEvents";
import { useNowSeconds } from "@/hooks/useNowSeconds";
import { useRaceRecords } from "@/hooks/useRaceRecords";
import { useScannerCounts } from "@/hooks/useScannerCounts";
import { finishedCount } from "@/lib/records";
import {
  buildNeeds,
  racesToAskAboutResults,
  racesToAskAboutScanners,
  type Need,
} from "@/modules/organiser/needs";

export function useNeeds(address: string | null): Need[] {
  const { data } = useEvents();
  const nowS = useNowSeconds();

  const mine = data?.events.filter(({ event }) => event.organiser === address) ?? [];
  const now = nowS ?? 0n;

  const scannerIds = racesToAskAboutScanners(mine, now);
  const resultIds = racesToAskAboutResults(mine, now);

  const scannerCounts = useScannerCounts(scannerIds);
  const records = useRaceRecords(resultIds);

  const resultCounts = new Map<number, number>();
  for (const [eventId, rows] of records) resultCounts.set(eventId, finishedCount(rows));

  if (nowS === undefined) return [];
  return buildNeeds({ events: mine, nowS: now, scannerCounts, resultCounts });
}
```

`useNowSeconds` returns `bigint | undefined` (`src/hooks/useNowSeconds.ts:26`): it is a
`useSyncExternalStore` whose server snapshot is `undefined`, so the first render on the server has
no clock. The guard is what stops a race being called overdue during hydration, and the `?? 0n`
above it is only there to keep the two request lists typed while that is true.

- [ ] **Step 7: Hang the bell in the header**

In `ConsoleFrame.tsx`, call `useNeeds(address)` and put the result on a context so each page's
`ConsoleHeader` can render `<NeedsBell needs={needs} />` without fetching again. The simplest form
that does not add a dependency:

```tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { Need } from "../needs";

const NeedsContext = createContext<readonly Need[]>([]);

export function useNeedsContext(): readonly Need[] {
  return useContext(NeedsContext);
}

export function NeedsProvider({ needs, children }: { needs: readonly Need[]; children: ReactNode }) {
  return <NeedsContext.Provider value={needs}>{children}</NeedsContext.Provider>;
}
```

Put that in `fe/src/modules/organiser/component/NeedsContext.tsx`, wrap `ConsoleFrame`'s children in
it, and have `ConsoleHeader` default its `bell` prop to `<NeedsBell needs={useNeedsContext()} />`.

- [ ] **Step 8: Run the suite and look at it**

```bash
pnpm --filter fe test
pnpm --filter fe dev
```

Expected: the bell in the header of `/org`, with a count if the connected wallet has a race that is
not open.

- [ ] **Step 9: Commit**

```bash
git add fe/src/modules/organiser/component/NeedsBell.tsx fe/src/modules/organiser/component/UrgentBanner.tsx fe/src/modules/organiser/component/NeedsContext.tsx fe/src/hooks/useNeeds.ts fe/test/NeedsBell.test.tsx fe/src/modules/organiser/component/ConsoleFrame.tsx fe/src/modules/organiser/component/ConsoleHeader.tsx
git commit -m "fe: carry what needs the organiser on every page (STE-17)"
```

---

## Task 8: the dashboard's totals and its table

**Files:**
- Create: `fe/src/modules/organiser/component/StatCard.tsx`
- Create: `fe/src/modules/organiser/component/Sparkline.tsx`
- Create: `fe/src/modules/organiser/component/RacesTable.tsx`
- Create: `fe/src/modules/organiser/chart.ts`
- Create: `fe/test/chart.test.ts`
- Create: `fe/test/RacesTable.test.tsx`
- Modify: `fe/src/modules/organiser/OrganiserHome.tsx`
- Modify: `fe/test/OrganiserHome.test.tsx`

**Interfaces:**
- Consumes: `entriesPerDay` (Task 6), `statusLabel` (Task 1), `EventStatusBadge`.
- Produces: `sparklinePath(values, width, height): string | null`,
  `<StatCard label value unit? filled? />`, `<RacesTable rows />`.

- [ ] **Step 1: Write the failing chart test**

Create `fe/test/chart.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { sparklinePath } from "@/modules/organiser/chart";

describe("sparklinePath", () => {
  describe("positive", () => {
    it("draws a point per value across the full width", () => {
      const path = sparklinePath([0, 1, 2], 80, 20);

      expect(path).not.toBeNull();
      expect(path!.split(" ").filter((part) => part.includes(",")).length).toBe(3);
      expect(path!.startsWith("M 0,")).toBe(true);
      expect(path!).toContain("80,");
    });

    it("puts the largest value at the top", () => {
      const path = sparklinePath([0, 10], 100, 20)!;
      const [, last] = path.split("L ");
      const y = Number(last.split(",")[1]);

      expect(y).toBeLessThan(10);
    });
  });

  describe("negative", () => {
    it("returns null for a race nobody has entered", () => {
      // A flat line at zero and "no data" look identical, and the caller draws
      // a neutral rule for the second rather than a line that claims a shape.
      expect(sparklinePath([0, 0, 0], 80, 20)).toBeNull();
    });

    it("returns null for an empty series", () => {
      expect(sparklinePath([], 80, 20)).toBeNull();
    });
  });

  describe("edge", () => {
    it("draws a single value as a flat line rather than dividing by zero", () => {
      const path = sparklinePath([5], 80, 20);

      expect(path).not.toBeNull();
      expect(path!).not.toContain("NaN");
    });

    it("never produces NaN when every value is equal", () => {
      const path = sparklinePath([4, 4, 4], 80, 20);

      expect(path).not.toBeNull();
      expect(path!).not.toContain("NaN");
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter fe test test/chart.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the geometry**

Create `fe/src/modules/organiser/chart.ts`:

```ts
/**
 * The arithmetic behind the console's charts, kept away from the components.
 *
 * Divisions by zero in an SVG path do not throw: they produce `NaN`, the
 * browser drops the path, and the panel renders empty with nothing in the
 * console. Every one of them is guarded here, where a test can see it.
 */

/**
 * A polyline through a series, scaled to fill the box.
 *
 * `null` when there is nothing to draw. A race nobody has entered would
 * otherwise get a flat line along the bottom, which reads as a measurement
 * rather than as an absence; the caller draws a plain rule instead.
 */
export function sparklinePath(
  values: readonly number[],
  width: number,
  height: number,
): string | null {
  if (values.length === 0) return null;
  const top = Math.max(...values);
  if (top <= 0) return null;

  const step = values.length === 1 ? 0 : width / (values.length - 1);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : index * step;
    const y = height - (value / top) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return `M ${points[0]}` + points.slice(1).map((point) => ` L ${point}`).join("");
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
pnpm --filter fe test test/chart.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Write the two small components**

Create `fe/src/modules/organiser/component/StatCard.tsx`:

```tsx
/**
 * A number with its comparison underneath.
 *
 * The bar is there because a number without context is unfinished — 4,680 sUSD
 * says nothing until you know it is 62% of what a sell-out pays. It is a bar
 * rather than a sentence because the sentence was cut: an organiser reading
 * four cards does not want four explanations.
 */
export function StatCard({
  label,
  value,
  unit,
  filled,
  tone = "teal",
}: {
  label: string;
  value: string;
  unit?: string;
  /** 0–1. Omit when there is nothing to compare against. */
  filled?: number;
  tone?: "teal" | "success";
}) {
  const width = filled === undefined ? null : `${Math.min(100, Math.max(0, filled * 100))}%`;

  return (
    <div className="rounded-lg border border-n-200 bg-paper p-4">
      <p className="text-xs text-n-500">{label}</p>
      <p className="numeric mt-1.5 text-3xl font-medium text-ink">
        {value}
        {unit ? <span className="ml-1 text-sm font-normal text-n-500">{unit}</span> : null}
      </p>
      {width === null ? null : (
        <div aria-hidden className="mt-3 h-1.5 overflow-hidden rounded-full bg-n-100">
          <div
            className={tone === "success" ? "h-full rounded-full bg-success" : "h-full rounded-full bg-teal"}
            style={{ width }}
          />
        </div>
      )}
    </div>
  );
}
```

Create `fe/src/modules/organiser/component/Sparkline.tsx`:

```tsx
import { sparklinePath } from "../chart";

/**
 * Fourteen days of entries, small enough to sit in a table row.
 *
 * A race with no entries gets a rule rather than a line, because a flat line
 * along the bottom reads as a measurement and this is an absence.
 */
export function Sparkline({ values, label }: { values: readonly number[]; label: string }) {
  const path = sparklinePath(values, 84, 22);

  return (
    <svg width="86" height="26" viewBox="-1 -2 88 26" role="img" aria-label={label}>
      {path === null ? (
        <line x1="0" y1="22" x2="84" y2="22" stroke="var(--color-n-200)" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d={path} fill="none" stroke="var(--color-teal)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      )}
    </svg>
  );
}
```

- [ ] **Step 6: Write the failing table test**

Create `fe/test/RacesTable.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RacesTable, type RaceRow } from "@/modules/organiser/component/RacesTable";

function row(overrides: Partial<RaceRow> = {}): RaceRow {
  return {
    eventId: 1,
    name: "Fun Run Sleman",
    startsAt: 1_800_259_200n,
    status: "Open",
    entered: 88,
    quota: 300,
    entriesPerDay: [1, 2, 3],
    ...overrides,
  };
}

describe("RacesTable", () => {
  describe("positive", () => {
    it("names each race and how full it is", () => {
      render(<RacesTable rows={[row()]} nowS={1_800_000_000n} />);

      expect(screen.getByText("Fun Run Sleman")).toBeInTheDocument();
      expect(screen.getByText("88 / 300")).toBeInTheDocument();
    });

    it("gives every race a way into its own page", () => {
      render(<RacesTable rows={[row()]} nowS={1_800_000_000n} />);

      expect(screen.getByRole("link", { name: /Fun Run Sleman/ })).toHaveAttribute(
        "href",
        "/org/events/1",
      );
    });

    it("says how long there is until race day", () => {
      render(<RacesTable rows={[row()]} nowS={1_800_000_000n} />);

      expect(screen.getByText(/in 3 days/)).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("says a race has already run rather than counting down past zero", () => {
      render(<RacesTable rows={[row({ startsAt: 1_799_000_000n })]} nowS={1_800_000_000n} />);

      expect(screen.getByText(/days ago/)).toBeInTheDocument();
    });

    it("renders an empty state rather than a bare table head", () => {
      render(<RacesTable rows={[]} nowS={1_800_000_000n} />);

      expect(screen.getByText("You have not published a race yet.")).toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("never prints the word Draft", () => {
      const { container } = render(
        <RacesTable rows={[row({ status: "Draft" })]} nowS={1_800_000_000n} />,
      );

      expect(container.textContent).not.toMatch(/draft/i);
      expect(screen.getByText("Not open yet")).toBeInTheDocument();
    });

    it("survives a quota of zero without dividing by it", () => {
      // The contract refuses a zero quota, but a partly-read event can still
      // reach this table with no categories at all.
      render(<RacesTable rows={[row({ entered: 0, quota: 0 })]} nowS={1_800_000_000n} />);

      expect(screen.getByText("0 / 0")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 7: Write the table**

Create `fe/src/modules/organiser/component/RacesTable.tsx`:

```tsx
/**
 * Every race this wallet organises, one row each.
 *
 * The sparkline earns its column: a bar says 312 of 500, and the line says
 * whether it is still moving. A race that has already run falls to the floor, a
 * race that was never opened is flat, and neither of those is visible in the
 * bar beside it.
 */
import Link from "next/link";

import { EventStatusBadge } from "@/components/elements/EventStatusBadge";
import { formatEventDate } from "@/utils/format";
import type { EventStatus } from "@sterunxyz/sdk";

import { Sparkline } from "./Sparkline";

export interface RaceRow {
  eventId: number;
  name: string;
  startsAt: bigint;
  status: EventStatus;
  entered: number;
  quota: number;
  entriesPerDay: number[];
}

const DAY = 86_400n;

function when(startsAt: bigint, nowS: bigint): string {
  if (startsAt <= nowS) {
    const days = (nowS - startsAt) / DAY;
    if (days === 0n) return "today";
    return days === 1n ? "yesterday" : `${days} days ago`;
  }
  const days = (startsAt - nowS) / DAY;
  if (days === 0n) return "today";
  return days === 1n ? "tomorrow" : `in ${days} days`;
}

export function RacesTable({ rows, nowS }: { rows: readonly RaceRow[]; nowS: bigint }) {
  if (rows.length === 0) {
    return <p className="px-4 py-6 text-sm text-n-500">You have not published a race yet.</p>;
  }

  return (
    <table className="w-full border-separate border-spacing-0 text-sm">
      <thead>
        <tr>
          {["Race", "Status", "Last 14 days", "", "", ""].map((head, index) => (
            <th
              key={head || index}
              scope="col"
              className="whitespace-nowrap bg-n-100 px-4 py-2.5 text-left font-medium text-n-600 first:rounded-l-md last:rounded-r-md"
            >
              {head}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((race) => (
          <tr key={race.eventId}>
            <td className="border-b border-n-200 px-4 py-3 align-middle">
              <Link href={`/org/events/${race.eventId}`} className="font-medium text-ink">
                {race.name}
              </Link>
              <span className="numeric mt-0.5 block text-xs text-n-500">
                {formatEventDate(race.startsAt)} · {when(race.startsAt, nowS)}
              </span>
            </td>
            <td className="border-b border-n-200 px-4 py-3 align-middle">
              <EventStatusBadge status={race.status} />
            </td>
            <td className="border-b border-n-200 px-4 py-3 align-middle">
              <Sparkline
                values={race.entriesPerDay}
                label={`Entries over the last ${race.entriesPerDay.length} days for ${race.name}`}
              />
            </td>
            <td className="border-b border-n-200 px-4 py-3 align-middle">
              <div aria-hidden className="h-2 min-w-28 overflow-hidden rounded-full bg-n-100">
                <div
                  className="h-full rounded-full bg-teal"
                  style={{ width: race.quota === 0 ? "0%" : `${Math.min(100, (race.entered / race.quota) * 100)}%` }}
                />
              </div>
            </td>
            <td className="numeric whitespace-nowrap border-b border-n-200 px-4 py-3 text-right align-middle text-n-600">
              {race.entered} / {race.quota}
            </td>
            <td className="w-px whitespace-nowrap border-b border-n-200 px-4 py-3 text-right align-middle">
              <Link href={`/org/events/${race.eventId}`} className="text-teal">
                Open
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 8: Run the table test**

```bash
pnpm --filter fe test test/RacesTable.test.tsx
```

Expected: PASS, 7 tests.

- [ ] **Step 9: Rebuild the page**

Rewrite `fe/src/modules/organiser/OrganiserHome.tsx` so its body is, in order: `<UrgentBanner>` when
`needs.find((need) => need.urgent)` returns one, a three-column grid of `<StatCard>`, and a card
holding `<RacesTable>`. Totals:

```tsx
  const published = mine.filter(({ event }) => event.status !== "Draft").length;
  const entries = mine.reduce(
    (total, { categories }) => total + categories.reduce((sum, c) => sum + c.enteredCount, 0),
    0,
  );
  const quota = mine.reduce(
    (total, { categories }) => total + categories.reduce((sum, c) => sum + c.quota, 0),
    0,
  );
```

`Received` is `Σ enteredCount × price` over every category; reuse whatever stroop formatter
`fe/src/utils/format.ts` already exports rather than writing another.

Keep the existing `ErrorNotice`, `EmptyState` and the "some races could not be loaded" line — they
still apply.

- [ ] **Step 10: Update the page's test and run everything**

`fe/test/OrganiserHome.test.tsx` asserts on the old card grid. Rewrite its assertions against the
table (`screen.getByRole("table")`, race names as links) and keep every existing case about the
allowlist notice and the unreadable-events line.

```bash
pnpm --filter fe test
pnpm --filter fe lint
pnpm --filter fe typecheck
```

- [ ] **Step 11: Look at it**

```bash
pnpm --filter fe dev
```

Compare `/org` against block 0 of the mockup. Then check it at 390px in the browser's device
toolbar: the three cards stack, the table scrolls sideways inside its card, and the page itself does
not scroll sideways.

- [ ] **Step 12: Commit**

```bash
git add fe/src/modules/organiser fe/test
git commit -m "fe: rebuild /org as a dashboard of every race (STE-17)"
```

---

## Task 9: entries comparison

**Files:**
- Create: `fe/src/modules/organiser/component/EntriesComparison.tsx`
- Modify: `fe/src/modules/organiser/chart.ts`
- Modify: `fe/test/chart.test.ts`
- Modify: `fe/src/modules/organiser/OrganiserHome.tsx`

**Interfaces:**
- Produces: `fillByDaysOut(records, quota, startsAt, nowS): { daysOut: number; filled: number }[]`,
  `smoothPath(points): string`.

- [ ] **Step 1: Write the failing test**

Append to `fe/test/chart.test.ts`:

```ts
import { fillByDaysOut, smoothPath } from "@/modules/organiser/chart";

const NOW = 1_800_000_000n;
const DAY = 86_400n;

describe("fillByDaysOut", () => {
  describe("positive", () => {
    it("counts an entry against the days it was made before race day", () => {
      const startsAt = NOW + 10n * DAY;
      const records = [{ enteredAt: NOW - 20n * DAY }, { enteredAt: NOW }];

      const series = fillByDaysOut(records, 4, startsAt, NOW);

      // 30 days out: one of four places gone. 10 days out: two of four.
      expect(series.at(0)).toEqual({ daysOut: 30, filled: 0.25 });
      expect(series.at(-1)).toEqual({ daysOut: 10, filled: 0.5 });
    });

    it("runs from the earliest entry to where the race is now", () => {
      const startsAt = NOW + 5n * DAY;
      const series = fillByDaysOut([{ enteredAt: NOW - DAY }], 10, startsAt, NOW);

      expect(series.at(-1)?.daysOut).toBe(5);
    });

    it("accumulates, so the line only ever climbs", () => {
      const startsAt = NOW + 1n * DAY;
      const series = fillByDaysOut(
        [{ enteredAt: NOW - 3n * DAY }, { enteredAt: NOW - 2n * DAY }, { enteredAt: NOW - DAY }],
        10,
        startsAt,
        NOW,
      );

      const filled = series.map((point) => point.filled);
      expect([...filled].sort((a, b) => a - b)).toEqual(filled);
    });
  });

  describe("negative", () => {
    it("is empty for a race nobody has entered", () => {
      expect(fillByDaysOut([], 100, NOW + DAY, NOW)).toEqual([]);
    });

    it("is empty for a quota of zero rather than dividing by it", () => {
      expect(fillByDaysOut([{ enteredAt: NOW }], 0, NOW + DAY, NOW)).toEqual([]);
    });
  });

  describe("edge", () => {
    it("caps at one when a race somehow holds more entries than places", () => {
      const series = fillByDaysOut([{ enteredAt: NOW }, { enteredAt: NOW }], 1, NOW + DAY, NOW);

      expect(series.at(-1)?.filled).toBe(1);
    });

    it("puts a race that has already run at zero days out", () => {
      const series = fillByDaysOut([{ enteredAt: NOW - 10n * DAY }], 10, NOW - DAY, NOW);

      expect(series.at(-1)?.daysOut).toBe(0);
    });
  });
});

describe("smoothPath", () => {
  it("starts at the first point and ends at the last", () => {
    const path = smoothPath([
      [0, 10],
      [50, 5],
      [100, 0],
    ]);

    expect(path.startsWith("M 0,10")).toBe(true);
    expect(path.endsWith("100,0")).toBe(true);
  });

  it("returns an empty string for no points", () => {
    expect(smoothPath([])).toBe("");
  });

  it("draws a single point without producing NaN", () => {
    expect(smoothPath([[5, 5]])).not.toContain("NaN");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter fe test test/chart.test.ts
```

Expected: FAIL — `fillByDaysOut is not a function`.

- [ ] **Step 3: Write them**

Append to `fe/src/modules/organiser/chart.ts`:

```ts
const DAY = 86_400n;

/** Just enough of a record for this maths; the full shape is in `lib/records.ts`. */
export interface EnteredAt {
  enteredAt: bigint;
}

export interface FillPoint {
  /** Days before race day the entry was made. Counts down along the x-axis. */
  daysOut: number;
  /** 0–1 of the race's total places. */
  filled: number;
}

/**
 * A race's fill against how long there was left before it ran.
 *
 * The x-axis is the whole idea. Two races months apart cannot be compared on
 * calendar dates, but "how full was it three weeks out" is the same question
 * for both. The y-axis is a fraction rather than a count for the same reason:
 * 240 places and 500 places are not the same race.
 *
 * Empty rather than flat when there is nothing to say. A quota of zero would
 * otherwise divide, and a race with no entries would draw a line along the
 * bottom that claims a measurement.
 */
export function fillByDaysOut(
  records: readonly EnteredAt[],
  quota: number,
  startsAt: bigint,
  nowS: bigint,
): FillPoint[] {
  if (quota <= 0 || records.length === 0) return [];

  const sorted = [...records].sort((a, b) => (a.enteredAt < b.enteredAt ? -1 : 1));
  const points: FillPoint[] = [];

  sorted.forEach((entry, index) => {
    const remaining = startsAt > entry.enteredAt ? (startsAt - entry.enteredAt) / DAY : 0n;
    points.push({
      daysOut: Number(remaining),
      filled: Math.min(1, (index + 1) / quota),
    });
  });

  // The line stops where the race is today, not at its last entry: a race that
  // sold nothing for a fortnight should show that fortnight.
  const last = points[points.length - 1];
  const today = startsAt > nowS ? Number((startsAt - nowS) / DAY) : 0;
  if (today < last.daysOut) points.push({ daysOut: today, filled: last.filled });

  return points;
}

/**
 * A Catmull-Rom curve through the points, as a cubic Bézier path.
 *
 * Smoothed because these are cumulative counts sampled irregularly, and the
 * comparison being made is of shape. It never overshoots into impossible
 * territory at this scale, but note that it is a drawing convenience — the
 * numbers people act on are in the key, not read off the curve.
 */
export function smoothPath(points: readonly (readonly [number, number])[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0][0]},${points[0][1]}`;

  let d = `M ${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i - 1] ?? points[0];
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const [x3, y3] = points[i + 2] ?? points[points.length - 1];
    const c1x = x1 + (x2 - x0) / 6;
    const c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6;
    const c2y = y2 - (y3 - y1) / 6;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`;
  }
  return d;
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
pnpm --filter fe test test/chart.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the chart**

Create `fe/src/modules/organiser/component/EntriesComparison.tsx`. It takes
`series: { name: string; finished: boolean; points: FillPoint[] }[]`, maps `daysOut` from a fixed
60 down to 0 across the width and `filled` up the height, draws each with `smoothPath`, gives the
finished race a dashed `var(--color-n-400)` stroke and the live ones `var(--color-teal)` and
`var(--color-warning-strong)`, and renders a key underneath with each race's final percentage.

Two things the component must do, both of them load-bearing:

- Label the x-axis **days to race day** and the y-axis in percent. Without the axis label the chart
  is unreadable, and nothing else on the page explains it.
- Title the panel **Entries comparison**. Never "Pace".

- [ ] **Step 6: Put it on the page**

In `OrganiserHome.tsx`, fetch records for every race the wallet owns (`useRaceRecords(allIds)`),
build one series per race that has entries, and render the chart beside `TrendingEntries` (Task 10)
in a two-column grid above the table.

- [ ] **Step 7: Run everything and look at it**

```bash
pnpm --filter fe test && pnpm --filter fe typecheck && pnpm --filter fe dev
```

Expected: the chart matches block 0 of the mockup — a dashed grey benchmark, live races stopping
where they are.

- [ ] **Step 8: Commit**

```bash
git add fe/src/modules/organiser fe/test/chart.test.ts
git commit -m "fe: compare races by how full they were at the same point (STE-17)"
```

---

## Task 10: trending entries

**Files:**
- Create: `fe/src/modules/organiser/component/TrendingEntries.tsx`
- Modify: `fe/src/lib/records.ts`
- Modify: `fe/test/records.test.ts`
- Modify: `fe/src/modules/organiser/OrganiserHome.tsx`

**Interfaces:**
- Produces: `trending(input, nowS, days, limit): { eventId; eventName; code; count }[]` where
  `input` is `{ eventId, eventName, categories, records }[]`.

- [ ] **Step 1: Write the failing test**

Append to `fe/test/records.test.ts`:

```ts
describe("trending", () => {
  const categories = [
    { categoryId: 0, code: "5K" },
    { categoryId: 1, code: "10K" },
  ];

  describe("positive", () => {
    it("ranks distances by entries in the window, most first", () => {
      const ranked = trending(
        [
          {
            eventId: 1,
            eventName: "Fun Run Sleman",
            categories,
            records: [
              record({ tokenId: 1, categoryId: 0, enteredAt: NOW - DAY }),
              record({ tokenId: 2, categoryId: 0, enteredAt: NOW - DAY }),
              record({ tokenId: 3, categoryId: 1, enteredAt: NOW }),
            ],
          },
        ],
        NOW,
        7,
        4,
      );

      expect(ranked).toEqual([
        { eventId: 1, eventName: "Fun Run Sleman", code: "5K", count: 2 },
        { eventId: 1, eventName: "Fun Run Sleman", code: "10K", count: 1 },
      ]);
    });

    it("ranks across races, not within one", () => {
      const ranked = trending(
        [
          { eventId: 1, eventName: "A", categories, records: [record({ categoryId: 0 })] },
          {
            eventId: 2,
            eventName: "B",
            categories,
            records: [
              record({ tokenId: 2, categoryId: 0 }),
              record({ tokenId: 3, categoryId: 0 }),
            ],
          },
        ],
        NOW,
        7,
        4,
      );

      expect(ranked[0]).toEqual({ eventId: 2, eventName: "B", code: "5K", count: 2 });
    });
  });

  describe("negative", () => {
    it("leaves out a distance nobody entered in the window", () => {
      const ranked = trending(
        [{ eventId: 1, eventName: "A", categories, records: [record({ enteredAt: NOW - 30n * DAY })] }],
        NOW,
        7,
        4,
      );

      expect(ranked).toEqual([]);
    });
  });

  describe("edge", () => {
    it("keeps at most the number asked for", () => {
      const many = Array.from({ length: 9 }, (_, i) => ({
        eventId: i,
        eventName: `Race ${i}`,
        categories,
        records: [record({ tokenId: i, categoryId: 0 })],
      }));

      expect(trending(many, NOW, 7, 4)).toHaveLength(4);
    });

    it("falls back to the id when a category has no code", () => {
      // A partly-read event can reach this with categories missing. Printing
      // nothing at all would leave a row with a number and no name.
      const ranked = trending(
        [{ eventId: 1, eventName: "A", categories: [], records: [record({ categoryId: 3 })] }],
        NOW,
        7,
        4,
      );

      expect(ranked[0].code).toBe("Distance 3");
    });
  });
});
```

Add `trending` to the import at the top of the file.

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter fe test test/records.test.ts
```

Expected: FAIL — `trending is not a function`.

- [ ] **Step 3: Write it**

Append to `fe/src/lib/records.ts`:

```ts
export interface TrendingInput {
  eventId: number;
  eventName: string;
  categories: readonly { categoryId: number; code: string }[];
  records: readonly IndexedRecord[];
}

export interface TrendingRow {
  eventId: number;
  eventName: string;
  code: string;
  count: number;
}

/**
 * Which distances are moving right now, across every race.
 *
 * Ranked by (race, distance) rather than by race, because the decision behind
 * the question is whether to add a wave — and that is made about one distance,
 * not about a whole event.
 */
export function trending(
  input: readonly TrendingInput[],
  nowS: bigint,
  days: number,
  limit: number,
): TrendingRow[] {
  const since = nowS - BigInt(days) * DAY;
  const rows: TrendingRow[] = [];

  for (const race of input) {
    const codes = new Map(race.categories.map((c) => [c.categoryId, c.code]));
    const counts = new Map<number, number>();

    for (const entry of race.records) {
      if (entry.enteredAt < since || entry.enteredAt > nowS) continue;
      counts.set(entry.categoryId, (counts.get(entry.categoryId) ?? 0) + 1);
    }

    for (const [categoryId, count] of counts) {
      rows.push({
        eventId: race.eventId,
        eventName: race.eventName,
        code: codes.get(categoryId) ?? `Distance ${categoryId}`,
        count,
      });
    }
  }

  return rows
    .sort((a, b) => b.count - a.count || a.eventId - b.eventId || a.code.localeCompare(b.code))
    .slice(0, limit);
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
pnpm --filter fe test test/records.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the panel and place it**

Create `TrendingEntries.tsx`: a titled card, `Last 7 days` on the right of its header, and one row
per `TrendingRow` — rank, the distance in medium weight with the race name under it in `text-n-500`,
and `+{count}` right-aligned. Render an empty state (`"No entries in the last 7 days."`) rather than
an empty list.

Place it beside `EntriesComparison` in `OrganiserHome.tsx`.

- [ ] **Step 6: Run everything**

```bash
pnpm --filter fe test && pnpm --filter fe lint && pnpm --filter fe typecheck
```

- [ ] **Step 7: Commit**

```bash
git add fe/src/lib/records.ts fe/src/modules/organiser fe/test/records.test.ts
git commit -m "fe: rank the distances that are moving right now (STE-17)"
```

---

## Task 11: write down what was built

**Files:**
- Modify: `fe/CLAUDE.md` (the `### /org` section, around line 316)
- Modify: `docs/WEB_APP_IA.md`

- [ ] **Step 1: Replace the `/org` section in `fe/CLAUDE.md`**

Cover, in prose rather than a list where it reads better: the shell and why it is a layout; that the
dashboard answers "how are my races doing" while what needs the organiser lives in the bell; the one
banner and the once-a-week test for whether its rule is still honest; that `statusLabel` is the only
place a status becomes words and `Draft` is never printed; that the directory now drops races that
are not open, and where (`browse.ts` → `publicEvents`, applied in `Directory.tsx`); and that
`run-progress.ts` is a bug fix rather than a draft feature, with the reason — an event on chain
already has a permanent name and date, so there is nothing to draft.

- [ ] **Step 2: Update the page map in `docs/WEB_APP_IA.md`**

Add `/org/events/[id]` as planned-not-built, and note that `/org` no longer lists races as cards.

- [ ] **Step 3: Run the whole suite one more time**

```bash
pnpm --filter fe test && pnpm --filter fe lint && pnpm --filter fe typecheck && pnpm --filter fe build
```

- [ ] **Step 4: Commit**

```bash
git add fe/CLAUDE.md docs/WEB_APP_IA.md
git commit -m "docs: record the console's shell and dashboard (STE-17)"
```

---

## Self-review notes

Checked against the spec:

| Spec section | Task |
| --- | --- |
| Shape / sidebar | 4 |
| Dashboard: totals, comparison, trending, all races | 8, 9, 10 |
| What needs the organiser: bell + one banner | 5, 6, 7 |
| Copy rules: plain nouns, no mechanism | Global constraints; enforced per task |
| "Draft" leaves the interface | 1 |
| Not-open races hidden from the directory | 2 |
| Wizard keeps its progress | 3 |
| Where the data comes from | 6, 9, 10 |
| One race: four tabs | **the follow-on plan**, not this one |
| Scans per scanner, entry form fields | backend tickets, neither in this plan |

Two things this plan deliberately does **not** do, both recorded in the spec: the per-race console
(its own plan) and the mobile rail drawer (the shell renders the sidebar at every width; the drawer
lands with the tabs, where it is actually needed).
