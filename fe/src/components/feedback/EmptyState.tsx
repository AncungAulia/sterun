/**
 * Nothing to show, and a sentence saying why.
 *
 * Never rendered while a read is still in flight. An empty state over a pending
 * request reads as a verdict about the protocol rather than about the wait.
 *
 * **No box around it** (Ancung, 2026-09-23, from loket.com's own empty search).
 * A dashed rectangle draws a frame around an absence, which is the one thing on
 * a page that does not need emphasis, and it read as a placeholder somebody had
 * forgotten to fill. What is left is a column: a mark, the sentence in bold,
 * then what to do about it, centred in the space the list would have taken.
 *
 * The mark is a prop rather than a fixed glyph: a search that found nothing and
 * a race with no distances yet are different absences, and the icon is the part
 * that says which without reading.
 */
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  /** Drawn above the title. Left out where no glyph says anything true. */
  icon?: LucideIcon;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {Icon ? (
        <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-n-100 text-n-500">
          <Icon className="size-6" />
        </span>
      ) : null}
      <p className="heading-strong text-xl text-ink">{title}</p>
      {children ? <p className="max-w-md text-base text-n-600">{children}</p> : null}
    </div>
  );
}
