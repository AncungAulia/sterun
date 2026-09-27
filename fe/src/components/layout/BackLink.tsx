/**
 * The way back from a page one level down (Ancung, 2026-09-17).
 *
 * It replaces the small underlined link that named the parent page, which was
 * a breadcrumb trail with one crumb in it. Nothing in this app is more than one
 * step from where it started, so a trail has nothing to show: what a reader
 * wants there is the one thing a back button already is.
 *
 * A link rather than `history.back()`: a race page opened from a search result
 * or a shared message has no history to go back to, and the destination is
 * always known anyway. That also keeps middle-click and "open in new tab"
 * working, which a button throws away.
 */
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2 self-start text-n-600">
      <Link href={href}>
        <ArrowLeftIcon aria-hidden="true" />
        {children}
      </Link>
    </Button>
  );
}
