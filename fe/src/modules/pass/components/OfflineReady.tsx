"use client";

/**
 * Registers the pass's service worker, scoped to `/pass` and nothing else.
 *
 * The scope is the whole point. A worker over the origin would cache the
 * directory and the race pages, and a cached race page can show a quota the
 * chain no longer agrees with, which is the one claim this product cannot
 * afford to break (docs/WEB_APP_IA.md section 1).
 *
 * Failure is silent on purpose. A pass that did not cache still works for as
 * long as it is open, which is the whole of a visit to a pickup desk, and an
 * error banner over a working screen helps nobody at a desk.
 */
import { useEffect } from "react";

export function OfflineReady() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/pass-sw.js", { scope: "/pass" }).catch(() => {});
  }, []);

  return null;
}
