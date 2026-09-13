"use client";

/**
 * The rail plus the page.
 *
 * Split out of `app/(organiser)/org/layout.tsx` for the same reason every route
 * file in this app is three lines long: the file under `app/` stays a server
 * component and the part that needs a hook lives in `modules/`. Here the hook
 * is the wallet, which the rail needs in order to list the races this address
 * organises.
 *
 * No height of its own. `app/layout.tsx` already gives `<main>` the space under
 * the site header, so the frame fills it and the rail stretches with it.
 */
import type { ReactNode } from "react";

import { useWallet } from "@/hooks/useWallet";

import { ConsoleSidebar } from "./ConsoleSidebar";

export function ConsoleFrame({ children }: { children: ReactNode }) {
  const { address } = useWallet();

  // WalletGate has already established there is one; this is for the types.
  if (!address) return null;

  return (
    <div className="flex w-full flex-1">
      <ConsoleSidebar address={address} />
      <div className="flex min-w-0 flex-1 flex-col bg-n-50">{children}</div>
    </div>
  );
}
