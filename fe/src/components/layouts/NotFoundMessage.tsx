/**
 * What a page that does not exist says, written once.
 *
 * Two files render it, because Next picks the CLOSEST `not-found.tsx` and
 * renders it inside that segment's layouts. A URL matching no route at all
 * lands at the root boundary, which has no chrome of its own and so needs
 * `SiteFrame`; `notFound()` thrown from inside `(browse)` lands inside
 * `(browse)/layout.tsx`, which has already drawn the header, so a second
 * `SiteFrame` there would print the lockup and the `<main>` twice. Neither
 * should have to hold its own copy of the sentence.
 */
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function NotFoundMessage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-16">
      <h1 className="heading-hero text-4xl text-ink">We could not find that page</h1>
      <p className="mt-3 max-w-xl text-lg text-n-600">
        The address may have been typed differently, or the page may have moved. The races are all
        still here.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Browse races</Link>
      </Button>
    </div>
  );
}
