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
 * No height of its own, and none needed: there is no site header over the
 * console, so this is a direct child of the `min-h-full flex-col` body and
 * `flex-1` is the whole viewport. That is also what lets the rail be exactly
 * one screen tall and stay there while the page scrolls.
 */
import type { ReactNode } from "react";

import { WalletGate } from "@/components/layouts/WalletGate";
import { useWallet } from "@/hooks/useWallet";

import { ConsoleSidebar } from "./ConsoleSidebar";
import { ConsoleWordmark } from "./ConsoleWordmark";

export function ConsoleFrame({ children }: { children: ReactNode }) {
  const { address } = useWallet();

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
    <div className="flex w-full flex-1">
      <ConsoleSidebar address={address} />
      {/* The page, and the landmark. `SiteFrame` gives every other route a
          <main>; without one here the console was the only part of the app a
          screen reader could not skip the navigation of, and the rail is
          exactly the thing worth skipping. It wraps the page rather than the
          whole frame, because a landmark that contains the navigation is not a
          landmark. */}
      <main className="flex min-w-0 flex-1 flex-col bg-n-50">{children}</main>
    </div>
  );
}
