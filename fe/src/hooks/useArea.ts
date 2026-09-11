import { useSyncExternalStore } from "react";

import { clearStoredArea, readArea, storeArea, subscribeArea, type Area } from "@/lib/area";

function serverArea(): undefined {
  return undefined;
}

/**
 * The chosen area, read on the client only.
 *
 * The server has no localStorage, so its snapshot is `undefined` and the first
 * client paint matches the markup it sent. The area appears one frame later.
 */
export function useArea() {
  const area = useSyncExternalStore<Area | null | undefined>(subscribeArea, readArea, serverArea);
  return { area: area ?? null, setArea: storeArea, clearArea: clearStoredArea };
}
