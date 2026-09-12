import { useSyncExternalStore } from "react";

import {
  clearStoredPlace,
  readStoredPlace,
  storePlace,
  subscribePlace,
  type StoredPlace,
} from "@/lib/area";

/**
 * The server has no localStorage, so its snapshot is the first-visit value and
 * the first client paint matches the markup it sent. The place appears one
 * frame later. It is a module constant because a new object on every call
 * re-renders for ever.
 */
const SERVER: StoredPlace = { place: null, asked: false };

function serverPlace(): StoredPlace {
  return SERVER;
}

/**
 * The chosen place, read on the client only.
 *
 * `asked` is handed back with it because the page has one thing to decide from
 * both: whether the browser's location prompt still has to be shown.
 */
export function useArea() {
  const stored = useSyncExternalStore(subscribePlace, readStoredPlace, serverPlace);
  return {
    place: stored.place,
    asked: stored.asked,
    setPlace: storePlace,
    clearPlace: clearStoredPlace,
  };
}
