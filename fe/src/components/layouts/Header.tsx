import Image from "next/image";
import Link from "next/link";

import { WalletButton } from "./WalletButton";

export function Header() {
  return (
    <header className="border-b border-n-200 bg-paper">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center" aria-label="Sterun home">
          <Image
            src="/brand/logo/sterun-lockup-black.svg"
            alt="Sterun"
            width={124}
            height={28}
            priority
          />
        </Link>
        <WalletButton />
      </div>
    </header>
  );
}
