"use client";

/**
 * Where the installed app opens (`manifest.ts` `start_url`).
 *
 * A manifest is one file for the whole origin and cannot carry a token id, so
 * the installed copy used to open the race directory: the one screen a runner
 * standing at a pickup desk did not want, on a phone that may have no signal
 * to load it with.
 *
 * This route is `/pass`, deliberately inside the offline worker's scope, so
 * the page itself is cached after one online visit and the redirect works at a
 * venue. Anything outside that scope (the directory, a race) is not cached and
 * would fail there, which is why the fallback below is a pair of links rather
 * than a redirect to `/`.
 *
 * It is a route rather than a middleware rule because the answer lives in
 * IndexedDB, which only the browser can read.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { latestEntry } from "@/lib/entry-store";

export function OpenPass() {
  const router = useRouter();
  const [found, setFound] = useState<"looking" | "none">("looking");

  useEffect(() => {
    let live = true;
    void latestEntry()
      .then((entry) => {
        if (!live) return;
        // `replace`, not `push`: this page is a doorway, and Back from the pass
        // should leave the app rather than bounce through it again.
        if (entry) router.replace(`/pass/${entry.tokenId}`);
        else setFound("none");
      })
      .catch(() => {
        if (live) setFound("none");
      });
    return () => {
      live = false;
    };
  }, [router]);

  if (found === "looking") {
    return (
      <div className="mx-auto my-auto w-full max-w-md px-5 py-6">
        <div role="status" aria-label="Opening your pass" className="skeleton h-96 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto my-auto flex w-full max-w-md flex-col gap-4 px-5 py-6 text-center">
      <h1 className="heading-strong text-2xl text-ink">No pass on this phone</h1>
      <p className="text-base text-n-600">
        A pass is kept on the phone that entered the race. If you entered on another device, connect
        the same wallet here and open the race from your entries.
      </p>
      <div className="flex flex-col gap-2">
        {/* The way out of this screen, and the reason it is first (Ancung,
            2026-09-23, from her own phone): a runner who entered on a laptop,
            or who installed the app and found the installed copy keeping its
            own storage, has an entry and no pass. `/profile` lists it and opens
            it with one press. It needs signal, like the two links below it, and
            fetching a pass needs signal anyway. */}
        <Button asChild>
          <Link href="/profile">Find my entries</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Browse races</Link>
        </Button>
        {/* The other offline screen. A volunteer installs the app too, and
            their home screen icon lands here just as a runner's does. */}
        <Button variant="outline" asChild>
          <Link href="/scan">Race pack desk</Link>
        </Button>
      </div>
    </div>
  );
}
