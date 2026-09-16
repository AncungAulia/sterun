/**
 * The pass, and in STE-22 the scanner.
 *
 * No site header: this is a screen held up at a desk, and every pixel above the
 * bib is one a volunteer has to look past. It is also the only route group the
 * service worker touches (docs/WEB_APP_IA.md section 1).
 */
import type { ReactNode } from "react";

export default function OfflineLayout({ children }: { children: ReactNode }) {
  return <main className="flex flex-1 flex-col">{children}</main>;
}
