"use client";

/**
 * The console's whole frame, in both of its states.
 *
 * Split out of `app/(organiser)/org/(console)/layout.tsx` for the same reason
 * every route file in this app is three lines long: the file under `app/` stays
 * a server component and the part that needs a hook lives in `modules/`. Here
 * the hook is the wallet, which decides which of the two frames is drawn.
 *
 * Connected, that is the rail beside the page. Not connected, it is a bar
 * carrying the wordmark over the ask itself. The second one is not a detail:
 * `/org` with no wallet is the first screen a new organiser ever sees, and it
 * used to be a card floating on an empty page with no `<main>` and no way back
 * to the site, because the gate stood outside this component and everything the
 * console draws stood inside it.
 *
 * The connected frame is a `SidebarProvider`, which is what makes the rail a
 * drawer at phone width. Two things about its shape are deliberate:
 *
 * - `SidebarInset` is NOT used, even though it would save a div. It renders the
 *   `<main>` itself, and the menu button has to sit outside that landmark: a
 *   landmark you cannot skip the navigation of is not a landmark, and the one
 *   control that opens the navigation counts as navigation. So the page keeps
 *   the same `<main>` it had before and the phone bar sits above it.
 * - The phone bar is `md:hidden`, the same breakpoint `Sidebar` itself uses to
 *   stop being a rail. Above it the rail carries the wordmark, so a second copy
 *   there would be the "STERUN twice in sixty pixels" bug that moved the header
 *   out of the root layout in the first place.
 */
import type { ReactNode } from "react";

import { WalletGate } from "@/components/wallet/WalletGate";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useNeeds } from "@/hooks/useNeeds";
import { useWallet } from "@/hooks/useWallet";

import { ConsoleSidebar } from "./ConsoleSidebar";
import { ConsoleWordmark } from "./ConsoleWordmark";
import { NeedsProvider } from "./NeedsContext";

export function ConsoleFrame({ children }: { children: ReactNode }) {
  const { address, disconnect } = useWallet();
  /*
    Worked out here rather than in the page, because the bell is on every
    console page and a second page working it out again would mean two lists
    that can disagree. It costs nothing extra: the races come from the same
    `useEvents()` query the rail already reads.
  */
  const needs = useNeeds(address);

  /*
    No wallet yet, or still restoring one. `WalletGate` says which of those it
    is and draws the right thing; this only gives it the chrome the console
    would otherwise be missing. It reads the same store in the same render, so
    the two cannot disagree about whether there is an address, and the children
    below are never reached in this branch for exactly that reason.
  */
  if (!address) {
    return (
      <div className="flex w-full flex-1 flex-col">
        <div className="flex shrink-0 items-center bg-ink px-2.5 py-4">
          <ConsoleWordmark />
        </div>
        <main className="flex flex-1 flex-col bg-n-50">
          <WalletGate>{children}</WalletGate>
        </main>
      </div>
    );
  }

  return (
    <SidebarProvider className="min-h-0 flex-1">
      <ConsoleSidebar address={address} onDisconnect={() => void disconnect()} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* No phone-width bar above the page any more (Ancung, 2026-09-14).
            It carried the wordmark and the menu button, and scrolled away with
            the page; the menu button now sits in the pinned ConsoleHeader and
            the wordmark in the drawer it opens. */}
        {/* The page, and the landmark. `SiteFrame` gives every other route a
            <main>; without one here the console was the only part of the app a
            screen reader could not skip the navigation of, and the rail is
            exactly the thing worth skipping. It wraps the page rather than the
            whole frame, because a landmark that contains the navigation is not
            a landmark. */}
        <main className="flex min-w-0 flex-1 flex-col bg-n-50">
          <NeedsProvider needs={needs}>{children}</NeedsProvider>
        </main>
      </div>
    </SidebarProvider>
  );
}
