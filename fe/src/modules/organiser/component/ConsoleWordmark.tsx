/**
 * The console's wordmark, and its only way back to the public site.
 *
 * There is no site header over `/org`, so this link is the whole exit. It lives
 * in a file of its own because it has to appear in three places that share no
 * other markup: in the rail once a wallet is connected, on the connect screen
 * before there is a rail at all, and in the phone-width bar that carries the
 * menu button. Two copies of an exit is how one of them ends up missing.
 *
 * It is the brand lockup rather than the letters STERUN set in a typeface. The
 * word was a stand-in: the app already owned the real mark and the site header
 * already drew it, so the console was the one surface showing a different
 * Sterun to the one every other page shows. The white lockup is the variant
 * here because the rail is `ink`.
 *
 * `next/image` and the sizing follow `components/layouts/Header.tsx`, with one
 * difference: the numbers keep the file's own 1245 by 400 proportions, so the
 * mark fills the box it is given instead of letterboxing inside it. The link
 * carries no `aria-label`, so its name comes from the image's `alt` and reads
 * as "Sterun". The site header's link is "Sterun home", and the two must stay
 * different: `console-chrome.test.tsx` proves no site header is drawn over the
 * console by looking for that exact name.
 */
import Image from "next/image";
import Link from "next/link";

import { cn } from "@/utils/cn";

export function ConsoleWordmark({
  className,
  onClick,
}: {
  className?: string;
  /** The rail is a drawer at phone width, and every link in it has to shut it. */
  onClick?: () => void;
}) {
  return (
    <Link
      href="/"
      onClick={onClick}
      className={cn("flex w-fit items-center rounded-md px-1", className)}
    >
      <Image
        src="/brand/logo/sterun-lockup-white.svg"
        alt="Sterun"
        width={112}
        height={36}
        priority
      />
    </Link>
  );
}
