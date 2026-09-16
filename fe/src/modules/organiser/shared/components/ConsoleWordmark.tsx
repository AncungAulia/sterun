/**
 * The console's wordmark, and its only way back to the public site.
 *
 * There is no site header over `/org`, so this link is the whole exit. It lives
 * in a file of its own because it has to appear in two places that share no
 * other markup: in the rail once a wallet is connected (which is also the
 * drawer at phone width), and on the connect screen before there is a rail at
 * all. There used to be a third, a phone-width bar over the page; it was
 * removed on 2026-09-14. Two copies of an exit is how one of them ends up
 * missing.
 *
 * It is the brand lockup rather than the letters STERUN set in a typeface. The
 * word was a stand-in: the app already owned the real mark and the site header
 * already drew it, so the console was the one surface showing a different
 * Sterun to the one every other page shows. The white lockup is the variant
 * here because the rail is `ink`.
 *
 * `next/image` and the sizing follow `components/layout/Header.tsx`, with one
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
      {/* Two files, one link, and the rail's own state chooses between them.
          Collapsed, the rail is a strip about as wide as an icon, and the
          lockup inside it was cropped to a sliver of the runner: a brand mark
          cut in half is worse than no brand mark. `Sidebar`'s own root carries
          `group` and `data-state`, so the selector matches only inside a rail:
          the connect screen and the phone-width bar draw this component too,
          are outside that group, and keep the lockup whichever way the rail is
          set.

          The link's name is a `sr-only` span rather than either `alt`, and
          that is not belt and braces. Both images are always in the DOM, and
          which one is showing is decided by a CSS class; jsdom applies no CSS,
          so in a test both count and a link named from the alts reads "Sterun
          Sterun". Naming the link once, out of band, makes it the same name on
          screen, in a screen reader and in a test, whichever way the rail is
          set. */}
      <span className="sr-only">Sterun</span>
      <Image
        src="/brand/logo/sterun-lockup-white.svg"
        alt=""
        aria-hidden
        width={112}
        height={36}
        priority
        className="group-data-[state=collapsed]:hidden"
      />
      <Image
        src="/brand/logo/sterun-logo-white.svg"
        alt=""
        aria-hidden
        width={24}
        height={24}
        className="hidden group-data-[state=collapsed]:block"
      />
    </Link>
  );
}
