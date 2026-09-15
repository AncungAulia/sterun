/**
 * What `notFound()` from a public page draws, an unknown race id above all.
 *
 * No `SiteFrame` here, deliberately. Next renders the closest `not-found.tsx`
 * inside that segment's layouts, and `(browse)/layout.tsx` has already drawn
 * the header and the `<main>`. Without this file the root one was used and
 * printed both a second time: measured in a browser at `/events/banana`, two
 * lockups and two `<main>` elements, which is the same defect this whole change
 * exists to remove.
 */
import { NotFoundMessage } from "@/components/layout/NotFoundMessage";

export default function BrowseNotFound() {
  return <NotFoundMessage />;
}
