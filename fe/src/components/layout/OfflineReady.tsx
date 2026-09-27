"use client";

/**
 * Registers the offline worker for whichever of the two offline screens this
 * is: the pass (`/pass`) or the desk (`/scan`). Nothing else.
 *
 * One file (`public/offline-sw.js`), one registration per scope. The scope is
 * the whole point: a worker over the origin would cache the directory and the
 * race pages, and a cached race page can show a quota the chain no longer
 * agrees with, which is the one claim this product cannot afford to break
 * (docs/WEB_APP_IA.md section 1).
 *
 * The pass's worker used to be `/pass-sw.js`. A browser that registered it
 * keeps it until told otherwise, and it would go on controlling `/pass` beside
 * this one, so it is unregistered here once.
 *
 * Failure is silent on purpose. A screen that did not cache still works for as
 * long as it is open, which is the whole of a visit to a pickup desk, and an
 * error banner over a working screen helps nobody at a desk.
 */
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export const OFFLINE_WORKER = "/offline-sw.js";
const RETIRED_WORKER = "/pass-sw.js";

/** The offline scope a path belongs to, or null for any other page. */
export function offlineScopeOf(pathname: string): "/pass" | "/scan" | null {
  if (pathname === "/scan" || pathname.startsWith("/scan/")) return "/scan";
  if (pathname === "/pass" || pathname.startsWith("/pass/")) return "/pass";
  return null;
}

export function OfflineReady() {
  const pathname = usePathname();
  const scope = offlineScopeOf(pathname ?? "");

  useEffect(() => {
    if (!scope || !("serviceWorker" in navigator)) return;
    const workers = navigator.serviceWorker;

    void workers.register(OFFLINE_WORKER, { scope }).catch(() => {});

    void workers
      .getRegistrations?.()
      .then((registrations) =>
        registrations
          .filter((registration) => registration.active?.scriptURL.endsWith(RETIRED_WORKER))
          .forEach((registration) => void registration.unregister()),
      )
      .catch(() => {});
  }, [scope]);

  return null;
}
