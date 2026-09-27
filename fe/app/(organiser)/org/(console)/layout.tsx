/**
 * The shell every console page sits in.
 *
 * A layout rather than a wrapper each page imports, so the rail does not
 * remount when somebody moves between races: its expander stays open and its
 * scroll position stays put, which is the whole reason for having it.
 *
 * The wallet gate is inside `ConsoleFrame` rather than around it. It used to
 * stand here, and that put every piece of chrome the console draws, the
 * wordmark link and the `<main>`, behind a connected wallet: the connect screen
 * itself, which is the first thing a new organiser ever sees, had neither.
 * One component reads the wallet and draws the right frame for it.
 *
 * The `(console)` group is why this covers `/org` and not `/org/new`. A layout
 * at `org/` would take the wizard with it, and the wizard wants the site header
 * and no rail. The group holds the console's own routes, `/org` today and
 * `/org/events/[id]` next, and nothing else. It changes no URL: a parenthesised
 * segment never appears in the path.
 *
 * No site header above any of it. The console carries its own wordmark and its
 * own wallet chip, so the global one would print both a second time.
 */
import type { ReactNode } from "react";

import { ConsoleFrame } from "@/modules/organiser/shared/components/ConsoleFrame";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return <ConsoleFrame>{children}</ConsoleFrame>;
}
