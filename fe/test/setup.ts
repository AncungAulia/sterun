import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

/**
 * jsdom implements neither of these, and Radix needs both: the popover measures
 * its trigger to position itself, and the scroll area asks elements to scroll
 * into view. Without them every combobox and calendar test dies on the first
 * open, which says nothing about the component.
 */
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

/**
 * jsdom has no matchMedia either, and the Done step asks it whether the viewer
 * wants reduced motion before firing confetti. Answering "no preference" is the
 * honest default: it keeps the confetti path exercised in tests rather than
 * quietly skipped, which is the half that can break.
 */
if (typeof window !== "undefined") {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

/**
 * jsdom returns null from `canvas.getContext("2d")`, and canvas-confetti draws
 * from inside a requestAnimationFrame callback, where a `.catch()` on the
 * import cannot reach it: the throw lands as an unhandled error instead. This
 * stub is the smallest surface confetti actually touches.
 */
if (typeof HTMLCanvasElement !== "undefined") {
  const context = {
    clearRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    fill: () => {},
    moveTo: () => {},
    lineTo: () => {},
    bezierCurveTo: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    save: () => {},
    restore: () => {},
    setTransform: () => {},
    fillRect: () => {},
    arc: () => {},
    fillStyle: "",
  };
  /*
   * Assigned through the original rather than with `??=`: jsdom DOES define
   * getContext, it just answers null, so a nullish default never fires. This
   * keeps a real implementation if one is ever installed and only fills in
   * where jsdom gives up.
   */
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    ...args: unknown[]
  ) {
    return (
      (original as ((...a: unknown[]) => unknown) | undefined)?.apply(this, args) ??
      (context as unknown)
    );
  } as never;
}

// Guarded because this file also runs for the e2e suite, which uses the node
// environment on purpose and has no DOM at all.
if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView ??= () => {};
  // Radix checks these before deciding how to trap focus and lock scrolling.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
}
