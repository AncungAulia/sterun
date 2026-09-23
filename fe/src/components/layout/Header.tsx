/**
 * The site's header: the way home, the way in for an organiser, and the wallet.
 *
 * **For organisers** is here because of who was missing (Ancung, 2026-09-23).
 * A runner arrives at a race page from a link and needs nothing from this bar,
 * but somebody who runs races had no entry point at all: the console is behind
 * a wallet, and a wallet that is not on the allowlist met a refusal with
 * nowhere to go. One link in the one place that is on every page fixes that,
 * and loket.com puts its own "Partner with Us" in exactly the same spot.
 *
 * It stays a plain link rather than a button: it is a way into reading, not
 * the page's action, and a second filled button next to the wallet would make
 * two things look equally urgent when one of them is how you sign.
 */
import Image from "next/image";
import Link from "next/link";

import { WalletButton } from "@/components/wallet/WalletButton";

export function Header() {
  return (
    <header className="border-b border-n-200 bg-paper">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:gap-4">
        <Link href="/" className="flex items-center" aria-label="Sterun home">
          <Image
            src="/brand/logo/sterun-lockup-black.svg"
            alt="Sterun"
            width={124}
            height={28}
            priority
          />
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/organisers"
            className="text-base text-n-600 underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            For organisers
          </Link>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
