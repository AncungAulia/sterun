/**
 * The shell every console page sits in.
 *
 * A layout rather than a wrapper each page imports, so the rail does not
 * remount when somebody moves between races: its expander stays open and its
 * scroll position stays put, which is the whole reason for having it.
 *
 * `WalletGate` lives here too. Every page below needs to know which wallet is
 * asking before it can show anything at all, and asking once here is what stops
 * two pages disagreeing about whether a wallet is still restoring.
 *
 * The `(console)` group is why this covers `/org` and not `/org/new`. A layout
 * at `org/` would take the wizard with it, and the wizard wants the site header
 * and no rail. The group holds the console's own routes, `/org` today and
 * `/org/events/[id]` next, and nothing else. It changes no URL: a parenthesised
 * segment never appears in the path.
 *
 * No site header above any of it. The rail carries the wordmark and the wallet
 * chip, so the global one would print both a second time.
 */
import type { ReactNode } from "react";

import { WalletGate } from "@/components/layouts/WalletGate";
import { ConsoleFrame } from "@/modules/organiser/component/ConsoleFrame";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <WalletGate>
      <ConsoleFrame>{children}</ConsoleFrame>
    </WalletGate>
  );
}
