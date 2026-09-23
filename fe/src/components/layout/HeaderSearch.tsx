"use client";

/**
 * The search box in the header (Ancung, 2026-09-23), where loket.com and
 * eventbrite.com both keep theirs.
 *
 * ## The query lives in the address, and that is the whole point
 *
 * It used to be state inside the directory, which is why it could not move up
 * here: a box on a race page that changes state on a page you are not looking
 * at does nothing, and a search box that does nothing is worse than no box.
 * Writing `/?q=…` instead means one behaviour from every page, a result a
 * person can send to somebody else, and Back that goes back a search rather
 * than off the page.
 *
 * ## Submitted, not typed
 *
 * A keystroke does not navigate. Pushing a route per letter fills the history
 * with half-typed words and makes Back useless, and this box is often on a
 * page that is not the directory, so each letter would also be a navigation.
 * Enter, or the button, sends it. On the directory itself that costs one press
 * and buys a URL worth keeping.
 *
 * The field is filled from the address on every render, so arriving at `/?q=jogja`
 * or pressing Back shows the search that is actually applied.
 */
import { SearchIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function HeaderSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const applied = params.get("q") ?? "";
  const [value, setValue] = useState(applied);

  // Follows the address: Back, a shared link, or Clear on the directory all
  // change `applied`, and the box has to say what is being searched.
  useEffect(() => {
    setValue(applied);
  }, [applied]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const query = value.trim();
    router.push(query ? `/?q=${encodeURIComponent(query)}` : "/");
  }

  return (
    <form role="search" onSubmit={submit} className="relative flex-1">
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-n-400"
      />
      <Input
        type="search"
        aria-label="Search races"
        placeholder="Search by race, venue or city"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="pl-9"
      />
      {/* Visible to a screen reader and to a keyboard, and off screen for
          everyone else: the magnifier on the left already says what the field
          is, and a second button inside a header this tight is clutter. */}
      <Button type="submit" variant="ghost" size="sm" className="sr-only focus:not-sr-only">
        Search
      </Button>
    </form>
  );
}
