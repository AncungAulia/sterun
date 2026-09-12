"use client";

/**
 * Ask the browser once, on the directory's first client render, where the
 * visitor is (Revision 4 of the directory spec, 2026-09-12).
 *
 * There is no prompt of our own. The browser draws its own, which is the only
 * one that can actually grant anything, and a homemade "may we ask?" step in
 * front of it just makes the visitor answer twice. The cost of going straight
 * to the real prompt is that it is spent: a browser shows it once per origin
 * and remembers the answer, so this must never fire twice.
 *
 * What happens with each answer:
 *   - allowed        the coordinates are stored and the list is ordered by how
 *                    far each race is from them.
 *   - refused        nothing changes on screen. No banner, no error. The page
 *   - dismissed      is exactly what it is for somebody who was never asked,
 *   - unavailable    and the picker in the header still works.
 *   - timed out
 *
 * The effect only calls a browser API and writes to a store that lives outside
 * React, so there is no `setState` here for the React Compiler to object to.
 */
import { useEffect } from "react";

import { markAsked, readStoredPlace, storePlace } from "@/lib/area";

/**
 * A cold GPS fix on a phone can take several seconds; a device with the radio
 * off may never answer at all. Without a timeout that second case leaves a
 * request outstanding for the life of the page.
 */
const TIMEOUT_MS = 10_000;

/** A fix from the last five minutes is near enough for ordering a race list. */
const MAX_AGE_MS = 5 * 60_000;

export function useNearbyPrompt(): void {
  useEffect(() => {
    // Read the store rather than take the answer as an argument. The effect can
    // run twice on mount (StrictMode) with the arguments of the first render,
    // and asking twice is the one thing this must not do.
    const { place, asked } = readStoredPlace();
    if (place || asked) return;

    // Missing in a non-secure context, in some embedded browsers, and in jsdom.
    const geolocation = globalThis.navigator?.geolocation;
    if (!geolocation) return;

    // Before the answer: a dismissed prompt calls neither callback, so a flag
    // written on the way out would never be written at all.
    markAsked();
    geolocation.getCurrentPosition(
      ({ coords }) => {
        // A place picked by hand while the prompt was open wins: it is the more
        // deliberate of the two answers.
        if (readStoredPlace().place) return;
        storePlace({ mode: "nearby", lat: coords.latitude, lng: coords.longitude });
      },
      () => {
        // Refused, unavailable or timed out. All three leave the page alone.
      },
      { timeout: TIMEOUT_MS, maximumAge: MAX_AGE_MS },
    );

    // No cleanup that discards a late answer. React mounts an effect twice in
    // development, so a flag set by the first cleanup was still set when the
    // browser answered the first request, and the coordinates were thrown away
    // every time. Nothing here holds React state: the store lives outside it,
    // so a write after unmount is a write to a store the next mount reads.
  }, []);
}
