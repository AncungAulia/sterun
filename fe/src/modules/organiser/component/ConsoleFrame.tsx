"use client";

/**
 * The rail plus the page.
 *
 * Split out of `app/(organiser)/org/(console)/layout.tsx` for the same reason
 * every route file in this app is three lines long: the file under `app/` stays
 * a server component and the part that needs a hook lives in `modules/`. Here
 * the hook is the wallet, which the rail needs in order to list the races this
 * address organises.
 *
 * No height of its own, and none needed: there is no site header over the
 * console, so this is a direct child of the `min-h-full flex-col` body and
 * `flex-1` is the whole viewport. That is also what lets the rail be exactly
 * one screen tall and stay there while the page scrolls.
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
