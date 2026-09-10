"use client";

/**
 * The sentence a field needs only sometimes, parked behind the label.
 *
 * ## Why anything moved off the page at all
 *
 * The console had grown a paragraph under every input. Each one was true, and
 * together they made a form nobody could scan: the line telling you a poster
 * has to be a PNG sat in the same grey type, at the same size, as the line
 * explaining that a waiver can never be swapped afterwards. Reading became a
 * decision, and a decision under every field is how somebody starts skipping
 * all of them.
 *
 * So the split is by kind, not by length. **What to type stays under the
 * field** — accepted formats, the size limit, what a code may contain. **Why it
 * matters, and what it costs later, goes in here** and is opened on purpose.
 *
 * ## What must never go in here
 *
 * A warning that carries a real cost (a name that cannot be changed, a distance
 * that cannot be removed, a document that cannot be replaced) is not optional
 * reading. `fe/CLAUDE.md` says those are stated plainly, and a tooltip is not
 * plainly: it is invisible until somebody hovers something. Warnings like that
 * belong in the section note, where they cannot be missed. What goes here is
 * the background that makes the warning make sense.
 */
import { InfoIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface HelpProps {
  /** What this explains, used for the button's name. Matches the field label. */
  label: string;
  children: ReactNode;
}

export function Help({ label, children }: HelpProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {/*
            A button, not an icon with a title: it has to be reachable by
            keyboard, and Radix opens the tooltip on focus as well as hover.
            The name says what it explains, because "more information" repeated
            nine times down a form tells a screen reader user nothing.
          */}
          <button
            type="button"
            aria-label={`About ${label.toLowerCase()}`}
            className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <InfoIcon aria-hidden="true" className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-sm leading-relaxed">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
