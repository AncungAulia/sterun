/**
 * The public chrome: the site header, and the page under it.
 *
 * It used to live in `app/layout.tsx`, which meant every route got it whether
 * it wanted it or not. The organiser console does not: it draws its own
 * wordmark and its own wallet chip in the rail, so a header above that rail
 * printed both of them twice within about sixty pixels. The root layout can
 * only say "always", so the decision moved down to the route groups and this is
 * what the groups that want a header render.
 *
 * The `<main>` belongs here rather than in the root layout for the same reason
 * it belongs next to the header at all: `flex flex-1 flex-col` inside a
 * `min-h-full` body is what lets a page fill the space the header leaves, and a
 * page with no header above it needs a different sum.
 */
import type { ReactNode } from "react";

import { Header } from "@/components/layout/Header";

export function SiteFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main className="flex flex-1 flex-col">{children}</main>
    </>
  );
}
