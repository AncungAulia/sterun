/**
 * The pass, and in STE-22 the scanner.
 *
 * No site header: this is a screen held up at a desk, and every pixel above the
 * bib is one a volunteer has to look past. It is also the only route group the
 * service worker touches (docs/WEB_APP_IA.md section 1).
 */
import type { ReactNode } from "react";

import { OfflineReady } from "@/modules/pass/components/OfflineReady";

export default function OfflineLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/*
        Registered here rather than on the page: this group is exactly what the
        worker caches, and a runner who opens the pass at all is a runner who
        will reload it at a venue. The scanner joins this group in STE-22 and
        will widen the scope with its own screens.
      */}
      <OfflineReady />
      <main className="flex flex-1 flex-col">{children}</main>
    </>
  );
}
