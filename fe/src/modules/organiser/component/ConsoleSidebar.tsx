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

const ITEM =
  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-paper/10 aria-[current=page]:bg-teal aria-[current=page]:font-medium aria-[current=page]:text-paper";

export function ConsoleSidebar({ address }: { address: string }) {
  const pathname = usePathname();
  const { data } = useEvents();
  /*
    Collapsed on the dashboard, open inside a race. The rail should show where
    you are without being asked, and it should not push the dashboard's own
    navigation down a screenful of race names on the page that needs it least.
  */
  const [open, setOpen] = useState(pathname.startsWith(`${RACES}/`));

  const mine = data?.events.filter(({ event }) => event.organiser === address) ?? [];

  return (
    <aside className="flex w-52 flex-col bg-ink px-2.5 py-4 text-n-300">
      <span className="px-3 pb-5 text-sm font-semibold tracking-[0.14em] text-paper">STERUN</span>

      <nav aria-label="Organiser console" className="flex flex-1 flex-col gap-1">
        <Link href="/org" aria-current={pathname === "/org" ? "page" : undefined} className={ITEM}>
          <LayoutDashboardIcon aria-hidden className="size-4" />
          Dashboard
        </Link>

        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          className={ITEM}
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
              const href = `${RACES}/${event.eventId}`;
              return (
                <li key={event.eventId}>
                  <Link
                    href={href}
                    aria-current={pathname === href ? "page" : undefined}
                    className="block rounded-md py-1.5 pl-9 pr-2.5 text-sm hover:bg-paper/10 aria-[current=page]:bg-teal aria-[current=page]:font-medium aria-[current=page]:text-paper"
                  >
                    {event.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </nav>

      {/* Which wallet's races these are. The rail lists exactly what this
          address organises, so the address belongs beside the list rather than
          only in the site header two levels up. */}
      <p className="mt-4 flex items-center gap-2 rounded-md bg-paper/5 px-2.5 py-2 text-xs">
        <span aria-hidden className="size-5 shrink-0 rounded-full bg-teal-300" />
        <span className="numeric truncate">{shortAddress(address)}</span>
      </p>
    </aside>
  );
}
