"use client";

/**
 * Whether the phone thinks it has a signal.
 *
 * `navigator.onLine` is not a promise that a request will succeed, and at a
 * venue it often says yes over a WiFi with nothing behind it. That is fine
 * here: the only thing it drives is a banner that reassures ("your pass still
 * works"), never a decision. Nothing on the pass waits for the network, so a
 * wrong answer costs a sentence, not a check-in.
 */
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    // The server has no network state, and the banner is never part of the
    // first paint, so answering "online" there keeps the markup stable.
    () => true,
  );
}
