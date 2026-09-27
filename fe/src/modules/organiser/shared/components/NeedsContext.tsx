"use client";

/**
 * What is waiting on the organiser, carried down from the frame.
 *
 * The list is assembled once, in `ConsoleFrame`, and read by whatever draws the
 * bell. A context rather than a prop through every page because the bell lives
 * in `ConsoleHeader`, which each page renders itself: passing the list by hand
 * would mean every future console page remembering to, and the one that forgot
 * would lose the bell silently.
 *
 * The default is an empty list rather than a throw. A console page rendered on
 * its own in a test is not a bug, and a bell with nothing in it is the right
 * answer there.
 */
import { createContext, useContext, type ReactNode } from "react";

import type { Need } from "../lib/needs";

const NeedsContext = createContext<readonly Need[]>([]);

export function useNeedsContext(): readonly Need[] {
  return useContext(NeedsContext);
}

export function NeedsProvider({
  needs,
  children,
}: {
  needs: readonly Need[];
  children: ReactNode;
}) {
  return <NeedsContext.Provider value={needs}>{children}</NeedsContext.Provider>;
}
