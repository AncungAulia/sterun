"use client";

/**
 * STE-13 — the public race directory, read from the chain on every visit.
 * Redesigned poster-first on 2026-09-11, then made one list led by the chosen
 * place (Revision 3 of docs/superpowers/specs/2026-09-11-directory-redesign-design.md).
 *
 * Four states, and the distinction between three of them is the whole point of
 * the page: loading, empty, failed, and a list. An empty registry and an
 * unreachable RPC must never look alike, because "no races exist" is a claim
 * about the protocol and "we could not ask" is a claim about the network.
 *
 * Everything a card shows beyond the chain (poster, venue, province) comes from
 * each event's document through the same verified query the event page uses,
 * so an unproven document contributes nothing here either. The featured row
 * waits until every document has answered, so it is chosen once instead of
 * reshuffling as posters arrive.
 *
 * On the first client render, a visitor with no place saved and no answer on
 * record is asked by the browser itself where they are (Revision 4 of the same
 * spec, 2026-09-12). Allowed, the list is ordered by how far each race really
 * is from them and the header reads "Near you". Refused, dismissed or
 * unanswered, the page is exactly what it was: all locations, in date order,
 * with the picker still there. Nothing on screen says that anything was asked.
 *
 * The place in the header sorts the page, it does not filter it: races in the
 * chosen place come first and the featured row prefers them, but every race
 * stays listed. It used to filter, which hid most of the directory behind a
 * choice made once and kept in a browser, and left a visitor in a quiet
 * province with an empty page. Because nothing is hidden, nothing has to wait
 * for documents either: the order settles as they arrive, the list does not
 * grow. Because an order is invisible on a page of races nobody knows, a line
 * under the heading names the place; a search or a filter takes it away, since
 * it would then claim an order the visitor can no longer check.
 *
 * The refresh control stays for the acceptance scenario in the ticket: create
 * an event, press refresh, and it appears without this app being redeployed.
 */
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCwIcon, SearchIcon } from "lucide-react";
import { useRef, useState } from "react";

import { EmptyState } from "@/components/elements/EmptyState";
import { ErrorNotice } from "@/components/elements/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useArea } from "@/hooks/useArea";
import { useEventDocuments } from "@/hooks/useEventDocuments";
import { eventKeys, useEvents } from "@/hooks/useEvents";
import { useNearbyPrompt } from "@/hooks/useNearbyPrompt";
import { useNowSeconds } from "@/hooks/useNowSeconds";
import { cn } from "@/utils/cn";

import {
  matchesSearch,
  pickFeatured,
  sortByPlace,
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
  const { place, setPlace, clearPlace } = useArea();
  const nowS = useNowSeconds();

  // Fires at most once per browser, and only with nothing saved and nothing
  // answered. Everything it can do happens in the store, so the page itself has
  // no state for it and no branch for a refusal.
  useNearbyPrompt();

  const headingRef = useRef<HTMLHeadingElement>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [order, setOrder] = useState<DateOrder>("soonest");

  const entries: DirectoryEntry[] = summaries.map((summary) => ({
    summary,
    document: documents.byEvent.get(summary.event.eventId) ?? null,
  }));
  // The search and the drawer decide what is shown; the place only decides what
  // comes first, so it is applied last and takes nothing away.
  const searched = entries.filter((item) => matchesSearch(item, query));
  const results = sortByPlace(
    searched.filter((item) => matchesFilters(item, filters)),
    place,
    order,
    nowS ?? 0n,
  );
  const narrowing = query.trim().length > 0 || activeFilterCount(filters) > 0;
  const featured =
    !narrowing && documents.settled && nowS !== undefined
      ? pickFeatured(entries, nowS, { place })
      : [];

  const heading = narrowing
    ? `${results.length} ${results.length === 1 ? "race matches" : "races match"}`
    : "All races";

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: eventKeys.all });
  }

  function clearNarrowing() {
    setQuery("");
    setFilters(NO_FILTERS);
    // Focus follows the change the press made. The button that was focused is
    // about to be removed with the empty state, and focus would otherwise fall
    // back to <body>, leaving a keyboard visitor at the top of the document
    // with no idea the list came back. Moved from the handler rather than an
    // effect: the heading is already on screen, so there is nothing to wait
    // for, and React Compiler does not allow the effect version.
    headingRef.current?.focus();
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-8 sm:py-10">
      <header className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <AreaPicker place={place} onSave={setPlace} onClear={clearPlace} />
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
          title="We could not load the races"
          detail="This is a connection problem, not an empty list. Please try again."
          onRetry={() => void refetch()}
        />
      ) : null}

      {data && data.events.length === 0 ? (
        <EmptyState title="No races yet">
          Refresh this page to check for races published since you opened it.
        </EmptyState>
      ) : null}

      {data && data.events.length > 0 ? (
        <>
          <FeaturedEvents entries={featured} />

          <section aria-labelledby="directory-list" className="flex flex-col gap-4">
            <h2
              id="directory-list"
              ref={headingRef}
              // Not in the tab order, but a target focus can be moved to.
              tabIndex={-1}
              className="heading-strong text-2xl text-ink"
            >
              {heading}
            </h2>
            {results.length > 0 ? (
              <EventGrid entries={results} pending={documents.pending} />
            ) : null}
            {results.length === 0 && narrowing ? (
              <>
                <EmptyState title="No races match">Try a different search or fewer filters.</EmptyState>
                <Button variant="link" className="self-center" onClick={clearNarrowing}>
                  Clear search and filters
                </Button>
              </>
            ) : null}
          </section>
        </>
      ) : null}

      {data && data.unreadable.length > 0 ? (
        <p className="text-sm text-n-500">Some races could not be loaded right now.</p>
      ) : null}
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
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {entries.map((item) => (
        <li key={item.summary.event.eventId}>
          <EventCard entry={item} documentLoading={pending.has(item.summary.event.eventId)} />
        </li>
      ))}
    </ul>
  );
}
