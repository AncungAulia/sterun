/**
 * The console's wordmark, and its only way back to the public site.
 *
 * There is no site header over `/org`, so this link is the whole exit. It lives
 * in a file of its own because it has to appear in two places that share no
 * other markup: in the rail once a wallet is connected, and on the connect
 * screen before there is a rail at all. Two copies of an exit is how one of
 * them ends up missing.
 */
import Link from "next/link";

import { cn } from "@/utils/cn";

export function ConsoleWordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "rounded-md px-3 text-sm font-semibold tracking-[0.14em] text-paper",
        className,
      )}
    >
      STERUN
    </Link>
  );
}
