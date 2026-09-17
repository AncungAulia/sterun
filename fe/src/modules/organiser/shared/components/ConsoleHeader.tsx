"use client";

/**
 * Every console page's top bar: what you are looking at, and the one thing you
 * can do to it.
 *
 * One action, not a row of them. The tabs inside a race each have exactly one,
 * download the roster, add a scanner, record the results, and putting it here
 * rather than under the content means it does not travel down the page as a
 * table grows. A race that can still take entries is the one exception: it
 * carries Close or Reopen entries beside Add places (STE-57), because closing
 * has to stay in reach until entries close on their own (STE-46).
 *
 * `bell` is a slot, and by default the slot fills itself from the frame's own
 * needs list. A page that wants no bell passes `bell={null}`; a page that wants
 * a different one passes it. What a page cannot do is forget the bell, which is
 * the failure worth designing out: what is waiting is the same everywhere, so
 * the page that forgot would be the page somebody was on when it mattered.
 */
import type { ReactNode } from "react";

import { MenuIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

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
  const { toggleSidebar } = useSidebar();

  return (
    // Pinned on every console page (Ancung, 2026-09-14): the title, the bell and
    // the page's one action stay in reach however far the content scrolls.
    // A race page wraps this and its tab strip in one pinned block of its own.
    <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-n-200 bg-paper px-4 py-4 md:gap-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {/* Phone only. Above `md` the rail folds from its own header. Below it
            the rail is a drawer, and this is the one button that opens it: the
            dark bar that used to carry it scrolled away with the page, and this
            header is pinned. Named for what it opens, not for the component. */}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Menu"
          onClick={toggleSidebar}
          className="-ml-2 shrink-0 md:hidden"
        >
          <MenuIcon aria-hidden />
        </Button>
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
