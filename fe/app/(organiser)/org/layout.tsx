/**
 * The shell every organiser page sits in.
 *
 * A layout rather than a wrapper each page imports, so the rail does not
 * remount when somebody moves between races: its expander stays open and its
 * scroll position stays put, which is the whole reason for having it.
 *
 * `WalletGate` lives here too. Every page below needs to know which wallet is
 * asking before it can show anything at all, and asking once here is what stops
 * two pages disagreeing about whether a wallet is still restoring.
 */
import type { ReactNode } from "react";

import { WalletGate } from "@/components/layouts/WalletGate";
import { ConsoleFrame } from "@/modules/organiser/component/ConsoleFrame";

export default function OrganiserLayout({ children }: { children: ReactNode }) {
  return (
    <WalletGate>
      <ConsoleFrame>{children}</ConsoleFrame>
    </WalletGate>
  );
}
