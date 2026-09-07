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

// Guarded because this file also runs for the e2e suite, which uses the node
// environment on purpose and has no DOM at all.
if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView ??= () => {};
  // Radix checks these before deciding how to trap focus and lock scrolling.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
}
