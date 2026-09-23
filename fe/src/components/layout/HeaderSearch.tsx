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
 *
 * ## The placeholder rolls
 *
 * "Search by race, venue or city" is three things read as one long line. The
 * words take turns instead, on a wheel (`roll-words` in globals.css), which
 * says the same thing in a quarter of the width and shows what can be typed
 * rather than describing it.
 *
 * It is a layer over the field rather than the `placeholder` attribute, which
 * cannot hold markup, and it is `aria-hidden`: the field's own label already
 * says what it is, and a screen reader reading three rotating words over it
 * would be noise. It disappears the moment there is anything to read instead.
 */
import { SearchIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * What `matchesSearch` actually looks at (`lib/browse.ts`), in the order a
 * runner would try them. A word here that the search does not match is a
 * promise the field breaks.
 */
const SEARCHABLE = ["race", "venue", "city"];

/**
 * The words the wheel actually shows: the three, then the first again, so the
 * loop lands on a copy of where it started instead of snapping back.
 */
const ROLLED = [...SEARCHABLE, SEARCHABLE[0]];

export function HeaderSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const applied = params.get("q") ?? "";
  const [value, setValue] = useState(applied);
  /*
    The box follows the address: Back, a shared link, or Clear on the directory
    all change `applied`, and the field has to say what is being searched.

    Adjusted during the render that sees the change rather than from an effect.
    An effect renders once with the stale value and again with the new one, and
    the React Compiler lint refuses it for exactly that reason; React documents
    this shape for state that has to follow a prop.
  */
  const [lastApplied, setLastApplied] = useState(applied);
  if (applied !== lastApplied) {
    setLastApplied(applied);
    setValue(applied);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const query = value.trim();
    router.push(query ? `/?q=${encodeURIComponent(query)}` : "/");
  }

  return (
    /* Its own row below `sm`, inline from there. At 390 the lockup, the box
       and the wallet share 358 pixels, which left the box about ninety and
       wrapped "Search by" onto two lines under a wallet chip sitting on top of
       it. `basis-full` in a wrapping bar is what puts it on the next line, and
       it has to be the basis rather than the width: `flex-1` is `flex: 1 1 0%`,
       so a `w-full` beside it is measured against a base size of zero and the
       box never wraps. One
       search box rather than two, because two would mean two fields with the
       same label and two subtrees reading the query. */
    <form role="search" onSubmit={submit} className="relative order-last basis-full sm:order-none sm:flex-1 sm:basis-0">
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-n-400"
      />
      <Input
        type="search"
        aria-label="Search races"
        // Empty on purpose: the rolling words below are the placeholder, and
        // both at once would print two.
        placeholder=""
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="pl-9"
      />

      {value === "" ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-9 flex items-center text-base text-muted-foreground"
        >
          <span>Search by&nbsp;</span>
          <span className="h-6 overflow-hidden">
            <span className="roll-track flex flex-col">
              {ROLLED.map((word, index) => (
                <span key={`${word}-${index}`} className="flex h-6 items-center">
                  {word}
                </span>
              ))}
            </span>
          </span>
        </div>
      ) : null}
      {/* Visible to a screen reader and to a keyboard, and off screen for
          everyone else: the magnifier on the left already says what the field
          is, and a second button inside a header this tight is clutter.

          `left-0` because `sr-only` is `position: absolute` and this button
          still carries its size utilities: a 1px box with 24px of padding, laid
          out after the input, sat past the right edge of a phone and gave the
          whole page seven pixels of sideways scroll. Pinned to the left of the
          form it is inside whatever the width, and focus makes it static
          again. */}
      <Button type="submit" variant="ghost" size="sm" className="sr-only left-0 focus:not-sr-only">
        Search
      </Button>
    </form>
  );
}
