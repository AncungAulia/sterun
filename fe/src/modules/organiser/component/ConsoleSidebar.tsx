"use client";

/**
 * The console's rail, built on shadcn's `sidebar`.
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
 *
 * WHY shadcn's component rather than the `<aside className="w-52">` this used
 * to be: the hand-rolled rail was a fixed width at every size. Measured in a
 * browser at 390 by 844 it took 208px of a 375px viewport, 55% of the screen,
 * and pushed the dashboard's own content out to a `scrollWidth` of 543 so the
 * whole page scrolled sideways. `Sidebar` is `hidden md:block` on a phone and
 * becomes a `Sheet` behind `SidebarTrigger` instead, which is the behaviour
 * that was missing rather than a tidier way of writing the same thing.
 *
 * Kept by hand, because the component supplies none of it: the expander's
 * open-state rule, the prefix match that marks a race from one of its own tabs,
 * the teal current-page fill, closing the drawer on navigation, and the wallet
 * chip in the footer.
 */
import { ChevronDownIcon, ChevronRightIcon, LayoutDashboardIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useEvents } from "@/hooks/useEvents";
import { shortAddress } from "@/utils/format";

import { ConsoleWordmark } from "./ConsoleWordmark";

/** Where a race's own pages live. One spelling for the links and for the checks below. */
const RACES = "/org/events";

/**
 * What marks the page you are on, shared so the two kinds of row cannot drift.
 *
 * shadcn spends one name, `sidebar-accent`, on both hover and the current page,
 * which leaves the row under the pointer indistinguishable from the row you are
 * actually on. In this app teal means "here, or actionable", so the current
 * page takes the teal and hover keeps the accent. It is written as a
 * `data-[active=true]` override rather than a new `aria-[current=page]` rule so
 * that `tailwind-merge` can see it conflicts with what the component already
 * says and drop the loser; two rules under different modifiers would both
 * survive and the winner would be decided by stylesheet order.
 *
 * Both facts still come from one boolean below, so what a screen reader
 * announces (`aria-current`) and what the eye sees (`data-active`) cannot
 * disagree.
 */
const MARK =
  "data-[active=true]:bg-teal data-[active=true]:font-medium data-[active=true]:text-paper";

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
  /*
    At phone width the rail is a drawer over the page. A drawer that stays open
    on top of the page you have just asked for reads as "the link did nothing",
    so every link in here shuts it on the way out. On a wide screen
    `setOpenMobile` is not what is showing and the call changes nothing.
  */
  const { setOpenMobile } = useSidebar();
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
  const onDashboard = pathname === "/org";

  const mine = data?.events.filter(({ event }) => event.organiser === address) ?? [];

  return (
    <Sidebar>
      {/* The way back to the public site, and the only one the console has:
          there is no header over these pages. A wordmark is where everybody
          already looks for it, so it is the wordmark rather than a new row in
          the nav, which would have to be named and would compete with the two
          items that are actually the console. The connect screen and the
          phone-width bar draw the same component, so the exit cannot exist in
          one state and not the others. */}
      <SidebarHeader className="px-2 pt-4 pb-3">
        <ConsoleWordmark onClick={() => setOpenMobile(false)} />
      </SidebarHeader>

      <SidebarContent className="px-2">
        {/* `SidebarContent` is a plain div, and the rail has to be a landmark
            a screen reader can skip past to reach the page. */}
        <nav aria-label="Organiser console">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={onDashboard} className={MARK}>
                <Link
                  href="/org"
                  aria-current={onDashboard ? "page" : undefined}
                  onClick={() => setOpenMobile(false)}
                >
                  <LayoutDashboardIcon aria-hidden />
                  <span>Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setOpen(!expanded)}
                aria-expanded={expanded}
                className={MARK}
              >
                {expanded ? (
                  <ChevronDownIcon aria-hidden />
                ) : (
                  <ChevronRightIcon aria-hidden />
                )}
                <span>Events</span>
              </SidebarMenuButton>

              {expanded ? (
                <SidebarMenuSub>
                  {mine.map(({ event }) => {
                    const href = `${RACES}/${event.eventId}`;
                    const here = marksRace(pathname, href);
                    return (
                      <SidebarMenuSubItem key={event.eventId}>
                        <SidebarMenuSubButton asChild isActive={here} className={MARK}>
                          <Link
                            href={href}
                            aria-current={here ? "page" : undefined}
                            onClick={() => setOpenMobile(false)}
                          >
                            <span>{event.name}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    );
                  })}
                </SidebarMenuSub>
              ) : null}
            </SidebarMenuItem>
          </SidebarMenu>
        </nav>
      </SidebarContent>

      {/* Which wallet's races these are, and the only place the console says
          so: there is no site header over these pages, because the rail already
          carries the wordmark and this chip. The rail lists exactly what this
          address organises, so the address belongs beside the list.

          It sits in the footer rather than after the nav, because the nav
          scrolls and the footer does not: on a short laptop screen a chip that
          travelled with a long list of races was already below the fold, and a
          wallet you have to scroll to find is a wallet you cannot check before
          you sign.

          The label is read, not seen. A shortened address on its own is a
          shape on screen and a string of letters read aloud, and neither says
          what it is the address of. */}
      <SidebarFooter className="px-2 pb-4">
        <p className="flex items-center gap-2 rounded-md bg-paper/5 px-2.5 py-2 text-xs">
          <span aria-hidden className="size-5 shrink-0 rounded-full bg-teal-300" />
          <span className="sr-only">Connected wallet</span>
          <span className="numeric truncate">{shortAddress(address)}</span>
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
