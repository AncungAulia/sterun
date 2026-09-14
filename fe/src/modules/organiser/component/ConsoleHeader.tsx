"use client";

/**
 * Every console page's top bar: what you are looking at, and the one thing you
 * can do to it.
 *
 * One action, not a row of them. The tabs inside a race each have exactly one,
 * download the roster, add a scanner, record the results, and putting it here
 * rather than under the content means it does not travel down the page as a
 * table grows.
 *
 * `bell` is a slot, and by default the slot fills itself from the frame's own
 * needs list. A page that wants no bell passes `bell={null}`; a page that wants
 * a different one passes it. What a page cannot do is forget the bell, which is
 * the failure worth designing out: what is waiting is the same everywhere, so
 * the page that forgot would be the page somebody was on when it mattered.
 */
import type { ReactNode } from "react";

import { SidebarTrigger } from "@/components/ui/sidebar";

import { NeedsBell } from "./NeedsBell";
import { useNeedsContext } from "./NeedsContext";

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
  const needs = useNeedsContext();

  return (
    // Pinned on every console page (Ancung, 2026-09-14): the title, the bell and
    // the page's one action stay in reach however far the content scrolls.
    // A race page wraps this and its tab strip in one pinned block of its own.
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-n-200 bg-paper px-6 py-4">
      <div className="flex min-w-0 items-center gap-3">
        {/* Desktop only. Below `md` the rail is a drawer and its trigger lives
            in the dark bar above this one, so a second one here would be two
            buttons for one thing. */}
        <SidebarTrigger aria-label="Collapse the menu" className="hidden md:flex" />
        {/* The badge sits beside the title from `md` and under it below. It
            used to live inside the <h1>, which truncates, so on a phone a long
            race name cut the status off entirely: the one fact an organiser
            opening this at the gate needs, whether entries are open. */}
        <div className="flex min-w-0 flex-col items-start gap-1 md:flex-row md:items-center md:gap-2">
          <h1 className="heading-strong max-w-full truncate text-xl text-ink">{title}</h1>
          {badge ? <span className="shrink-0">{badge}</span> : null}
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        {bell === undefined ? <NeedsBell needs={needs} /> : bell}
        {action}
      </div>
    </header>
  );
}
