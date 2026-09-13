import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/*
  Rewritten from what `shadcn add sidebar` generates, for two reasons rather
  than taste.

  The generated version holds `useState<boolean | undefined>(undefined)` and
  fills it in from an effect. `eslint-plugin-react-hooks` rejects that outright
  here (`react-hooks/set-state-in-effect`), and it is also wrong in a way you
  can see: the first client render always answers "not a phone", so a phone
  paints the desktop branch and then swaps. `useSyncExternalStore` asks the
  question at render time instead, which is what it is for.

  `innerWidth` stays the answer and the media query stays the subscription,
  exactly as upstream has it, so the breakpoint has one definition. The
  subscribe function is module-level because a new identity on every render
  makes React re-subscribe on every render.
*/
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onChange: () => void): () => void {
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    // The server has no viewport. Answering "not a phone" matches what the
    // markup Next sends already assumes.
    () => false,
  );
}
