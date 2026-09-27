/**
 * The pass (STE-21) and the volunteer's desk (STE-22).
 *
 * No site header: this is a screen held up at a desk, and every pixel above the
 * bib is one a volunteer has to look past. It is also the only route group the
 * service worker touches (docs/WEB_APP_IA.md section 1).
 */
import type { ReactNode } from "react";

import { OfflineReady } from "@/components/layout/OfflineReady";

export default function OfflineLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/*
        Registered here rather than on each page: this group is exactly what
        the worker caches, and anyone who opens the pass or the desk at all is
        someone who will reload it at a venue. It registers one scope per
        screen, never the origin.
      */}
      <OfflineReady />
      <main className="flex flex-1 flex-col">{children}</main>
    </>
  );
}
