"use client";

/**
 * The console's rail.
 *
 * Two items, and the second is an expander rather than a page: `Events` opens
 * into this wallet's races so somebody can move between them without going back
 * through a list. There is deliberately no "all races" page behind it, because
 * the dashboard already holds that table and a second one would be the same
 * list twice.
 *
 * Everything race-scoped, entries, scanners, results, lives inside a race
 * rather than here. A rail item that has to ask "of which race?" belongs in the
 * race.
 *
 * The races come from the directory's own `useEvents()` (the same query `/` and
 * `/org` share, so the rail costs no extra read) filtered to this wallet. A
 * failed read empties the expander and nothing else: the rail is navigation,
 * and a node that will not answer must not take away the way back.
 */
import { ChevronDownIcon, ChevronRightIcon, LayoutDashboardIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { useEvents } from "@/hooks/useEvents";
import { shortAddress } from "@/utils/format";

/** Where a race's own pages live. One spelling for the links and for the test below. */
const RACES = "/org/events";

/**
 * What marks the page you are on, shared so the two kinds of row cannot drift.
 *
 * It is written as one attribute, `aria-current`, and the fill is drawn from
 * that same attribute rather than from a second boolean. So what a screen
 * reader announces and what the eye sees are one fact, and there is no way for
 * them to disagree.
 */
const MARK =
  "hover:bg-paper/10 aria-[current=page]:bg-teal aria-[current=page]:font-medium aria-[current=page]:text-paper";
const ITEM = `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm ${MARK}`;
const RACE_ITEM = `block rounded-md py-1.5 pl-9 pr-2.5 text-sm ${MARK}`;

/**
 * Whether a race's row is the page you are on, its own tabs included.
 *
 * Exact match would be right only for as long as a race is one page. It is not
 * going to be: entries, scanners and results are tabs underneath it, and on
 * `/org/events/3/entries` an exact match marks nothing at all. That failure is
 * silent, which is the worst kind for navigation, so the prefix is written here
 * once rather than discovered later.
 *
 * The separator matters. `startsWith(href)` alone would let `/org/events/30`
 * mark race 3.
 */
function marksRace(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ConsoleSidebar({ address }: { address: string }) {
  const pathname = usePathname();
  const { data } = useEvents();
  const inRace = pathname.startsWith(`${RACES}/`);
  /*
    Null means nobody has touched it, so the path decides: collapsed on the
    dashboard, open inside a race. The rail should show where you are without
    being asked, and it should not push the dashboard's own navigation down a
    screenful of race names on the page that needs it least.

    Deriving it on every render rather than seeding `useState` once is the whole
    point. The rail lives in a layout precisely so that it does NOT remount
    between console pages, so a seed is read once, on a hard load, and never
    again: clicking a race from the dashboard left Events shut and marked a row
    that was not on the screen. Once somebody toggles it by hand, their answer
    wins and the path stops speaking.
  */
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? inRace;

  const mine = data?.events.filter(({ event }) => event.organiser === address) ?? [];

  return (
    /*
      One screen tall and pinned there, rather than as tall as the page.

      The wallet chip sits at the bottom of the rail, and on a rail that grows
      with the page the bottom is wherever the page ends: on a short laptop
      screen the chip was already below the fold on the dashboard, and a wallet
      you have to scroll to find is a wallet you cannot check before you sign.
      `h-dvh` with `self-start` stops the rail stretching, `sticky` keeps it in
      view, and the races scroll inside the nav instead of pushing the chip
      down. `shrink-0` is what keeps a long race name from squeezing the rail
      narrower than it was drawn.
    */
    <aside className="sticky top-0 flex h-dvh w-52 shrink-0 flex-col self-start bg-ink px-2.5 py-4 text-n-300">
      {/* The way back to the public site, and the only one the console has:
          there is no header over these pages. A wordmark is where everybody
          already looks for it, so it is the wordmark rather than a new row in
          the nav, which would have to be named and would compete with the two
          items that are actually the console. */}
      <Link
        href="/"
        className="mb-5 shrink-0 self-start rounded-md px-3 text-sm font-semibold tracking-[0.14em] text-paper"
      >
        STERUN
      </Link>

      <nav
        aria-label="Organiser console"
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto"
      >
        <Link href="/org" aria-current={pathname === "/org" ? "page" : undefined} className={ITEM}>
          <LayoutDashboardIcon aria-hidden className="size-4" />
          Dashboard
        </Link>

        <button
          type="button"
          onClick={() => setOpen(!expanded)}
          aria-expanded={expanded}
          className={ITEM}
        >
          {expanded ? (
            <ChevronDownIcon aria-hidden className="size-4" />
          ) : (
            <ChevronRightIcon aria-hidden className="size-4" />
          )}
          Events
        </button>

        {expanded ? (
          <ul className="flex flex-col gap-0.5">
            {mine.map(({ event }) => {
              const href = `${RACES}/${event.eventId}`;
              return (
                <li key={event.eventId}>
                  <Link
                    href={href}
                    aria-current={marksRace(pathname, href) ? "page" : undefined}
                    className={RACE_ITEM}
                  >
                    {event.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </nav>

      {/* Which wallet's races these are, and the only place the console says
          so: there is no site header over these pages, because the rail already
          carries the wordmark and this chip. The rail lists exactly what this
          address organises, so the address belongs beside the list.

          The label is read, not seen. A shortened address on its own is a
          shape on screen and a string of letters read aloud, and neither says
          what it is the address of. */}
      <p className="mt-4 flex shrink-0 items-center gap-2 rounded-md bg-paper/5 px-2.5 py-2 text-xs">
        <span aria-hidden className="size-5 shrink-0 rounded-full bg-teal-300" />
        <span className="sr-only">Connected wallet</span>
        <span className="numeric truncate">{shortAddress(address)}</span>
      </p>
    </aside>
  );
}
