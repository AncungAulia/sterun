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
    <header className="flex items-center justify-between gap-4 border-b border-n-200 bg-paper px-6 py-4">
      <h1 className="heading-strong text-xl text-ink">
        {title}
        {badge ? <span className="ml-2 align-middle">{badge}</span> : null}
      </h1>
      <div className="flex items-center gap-2.5">
        {bell === undefined ? <NeedsBell needs={needs} /> : bell}
        {action}
      </div>
    </header>
  );
}
