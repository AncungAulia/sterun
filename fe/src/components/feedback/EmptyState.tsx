/**
 * Nothing to show, and a sentence saying why.
 *
 * Never rendered while a read is still in flight. An empty state over a pending
 * request reads as a verdict about the protocol rather than about the wait.
 */
import type { ReactNode } from "react";

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-n-300 px-6 py-12 text-center">
      <p className="heading text-xl text-n-700">{title}</p>
      {children ? <p className="mx-auto mt-2 max-w-md text-base text-n-500">{children}</p> : null}
    </div>
  );
}
