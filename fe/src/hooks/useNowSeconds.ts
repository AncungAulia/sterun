import { useSyncExternalStore } from "react";

/**
 * The moment the page first painted, in unix seconds, on the client only.
 *
 * Same reasoning as TabTimeline's clock: the server's clock is not the
 * browser's, so the server snapshot is `undefined`, and the value is fixed at
 * first paint because `useSyncExternalStore` needs a snapshot that stops
 * changing. Races are days apart; a page left open for an hour loses nothing.
 */
let firstPaintS: bigint | undefined;

function subscribe() {
  return () => {};
}

function clientNow(): bigint {
  firstPaintS ??= BigInt(Math.floor(Date.now() / 1000));
  return firstPaintS;
}

function serverNow(): undefined {
  return undefined;
}

export function useNowSeconds(): bigint | undefined {
  return useSyncExternalStore(subscribe, clientNow, serverNow);
}
