"use client";

/**
 * The site's header: the way home, where you are, what you are looking for, the
 * way in for an organiser, and the wallet.
 *
 * Search and the place moved up here on 2026-09-23, from the directory's own
 * header, for the reason loket.com and eventbrite.com both keep theirs in the
 * bar: they are not the directory's, they are the visitor's. The place is a
 * choice kept in the browser that outlives the page, and search from a race
 * page used to be impossible without going back first. The query travels in the
 * address (`HeaderSearch`), which is what lets it work from anywhere.
 *
 * **Filters stayed with the list.** A filter changes the list you are reading;
 * in a bar that is on every page it would be a control that does nothing on
 * most of them. Loket does the same: search in the bar, filters on the results.
 *
 * **For organisers** is here because of who was missing: a runner arrives at a
 * race from a link and needs nothing from this bar, but somebody who runs races
 * had no entry point at all, and a wallet turned away by the allowlist had
 * nowhere to go. It is an outlined button with a mark of its own (Ancung), so
 * it reads as a door rather than as a footer link, and still does not compete
 * with the wallet, which is the one filled thing here.
 *
 * Below `sm` the bar keeps the lockup, the search box and the wallet; the place
 * and the organiser button drop out, since the directory's own header still
 * carries the place and `/organisers` is a tap away from the footer of any
 * page it matters on.
 */
import { GlobeIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { HeaderSearch } from "@/components/layout/HeaderSearch";
import { AreaPicker } from "@/components/place/AreaPicker";
import { Button } from "@/components/ui/button";
import { WalletButton } from "@/components/wallet/WalletButton";
import { useArea } from "@/hooks/useArea";

export function Header() {
  const { place, setPlace, clearPlace } = useArea();

  return (
    <header className="border-b border-n-200 bg-paper">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-4">
        <Link href="/" className="flex shrink-0 items-center" aria-label="Sterun home">
          <Image
            src="/brand/logo/sterun-lockup-black.svg"
            alt="Sterun"
            width={124}
            height={28}
            priority
          />
        </Link>

        <div className="hidden shrink-0 lg:block">
          <AreaPicker place={place} onSave={setPlace} onClear={clearPlace} />
        </div>

        {/* `useSearchParams` makes its own subtree dynamic, so the boundary is
            here rather than around the whole header: the lockup and the wallet
            still render while the query is read. */}
        <Suspense fallback={<div className="h-9 flex-1" />}>
          <HeaderSearch />
        </Suspense>

        <Button variant="outline" asChild className="hidden shrink-0 sm:inline-flex">
          <Link href="/organisers">
            <GlobeIcon aria-hidden="true" />
            For organisers
          </Link>
        </Button>

        <div className="shrink-0">
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
