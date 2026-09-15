/**
 * The page a URL matching no route at all lands on.
 *
 * It renders at the root boundary, which holds `<html>`, `<body>` and
 * `<Providers>` and no chrome whatsoever: the header moved down into the route
 * groups so that the organiser console could refuse it, and a URL in no group
 * inherits nothing from any of them. Without this file the one page somebody
 * reaches entirely by accident was the one page with no way back to the site.
 *
 * `SiteFrame` is what puts that right, and it restores the `<main>` landmark at
 * the same time. A group whose layout already draws the header needs its own
 * `not-found.tsx` WITHOUT it, which is why `(browse)` has one.
 */
import { NotFoundMessage } from "@/components/layout/NotFoundMessage";
import { SiteFrame } from "@/components/layout/SiteFrame";

export default function NotFound() {
  return (
    <SiteFrame>
      <NotFoundMessage />
    </SiteFrame>
  );
}
