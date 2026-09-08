"use client";

import { useSyncExternalStore } from "react";

/**
 * Reads the OS "reduce motion" setting and keeps following it, because people
 * turn it on mid-session when something on a page makes them ill.
 *
 * matchMedia is an external store, so it is read through useSyncExternalStore
 * rather than mirrored into state inside an effect. The server snapshot is
 * false: the server cannot know, and false matches what the CSS does before
 * hydration.
 *
 * This is the JS-side guard only. Anything that can be expressed in CSS should
 * also carry motion-reduce:, so it degrades before this hook has run at all.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
