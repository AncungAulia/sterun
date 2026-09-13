/**
 * Every console page's top bar: what you are looking at, and the one thing you
 * can do to it.
 *
 * One action, not a row of them. The tabs inside a race each have exactly one,
 * download the roster, add a scanner, record the results, and putting it here
 * rather than under the content means it does not travel down the page as a
 * table grows.
 *
 * `bell` is a slot rather than a component: what is waiting is the same on
 * every page, so it is passed in from above rather than fetched here.
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
