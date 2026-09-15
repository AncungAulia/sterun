"use client";

import { useEffect, useRef } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/**
 * A dot that trails the pointer, easing toward it rather than snapping.
 *
 * mix-blend-mode: difference means it never needs to know what it is over: it
 * inverts whatever is underneath, so it stays visible on the video, on paper
 * and on the overlay without a single colour branch.
 *
 * Only for pointer:fine. On a touch screen there is no cursor to follow, and
 * rendering it would pin a decorative element wherever the last tap landed.
 * Position is written straight to the DOM node inside rAF; putting it in state
 * would re-render this component sixty times a second for no reason.
 */
export function CursorFollower() {
  const dotRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const dot = dotRef.current;
    if (!dot) return;

    // Start off-screen so it does not flash at 0,0 before the first move.
    let targetX = -100;
    let targetY = -100;
    let x = targetX;
    let y = targetY;
    let frame = 0;
    let seen = false;

    function onMove(event: PointerEvent) {
      targetX = event.clientX;
      targetY = event.clientY;
      if (!seen) {
        // Jump to the first known position instead of gliding in from the corner.
        seen = true;
        x = targetX;
        y = targetY;
        dot!.style.opacity = "1";
      }
    }

    function tick() {
      // Lerp: each frame closes a fixed fraction of the remaining gap, which
      // is what makes it feel weighted rather than glued to the pointer.
      x += (targetX - x) * 0.18;
      y += (targetY - y) * 0.18;
      dot!.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      frame = requestAnimationFrame(tick);
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    frame = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [reduced]);

  if (reduced) return null;

  return (
    <div
      ref={dotRef}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[100] hidden h-[22px] w-[22px] rounded-full bg-paper opacity-0 mix-blend-difference [@media(pointer:fine)]:block"
    />
  );
}
