/**
 * The wizard keeps the site header and takes no rail.
 *
 * `/org/new` is six steps that end in signing, and permanent navigation beside
 * it offers a way out of a half-finished race at every moment, plus a second
 * one next to the step's own way back. So the console's shell stops at the
 * console: this route sits under `/org` in the URL only.
 *
 * The wallet gate is here rather than inside `CreateEvent` for the rule that
 * holds across the whole of `/org`: a layout gates, a page does not. Two gates
 * in one subtree means two components deciding separately whether the wallet is
 * still restoring, and the wizard's own copy became exactly that once the
 * console group took over the gating for its own routes.
 */
import type { ReactNode } from "react";

import { SiteFrame } from "@/components/layouts/SiteFrame";
import { WalletGate } from "@/components/layouts/WalletGate";

export default function NewEventLayout({ children }: { children: ReactNode }) {
  return (
    <SiteFrame>
      <WalletGate>{children}</WalletGate>
    </SiteFrame>
  );
}
