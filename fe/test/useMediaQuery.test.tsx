import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useMediaQuery } from "@/hooks/useMediaQuery";

const original = window.matchMedia;

function answer(matching: string) {
  window.matchMedia = ((query: string) => ({
    matches: query === matching,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

afterEach(() => {
  window.matchMedia = original;
});

describe("useMediaQuery", () => {
  it("is true when the query matches", () => {
    answer("(min-width: 640px)");

    const { result } = renderHook(() => useMediaQuery("(min-width: 640px)"));

    expect(result.current).toBe(true);
  });

  it("is false when it does not", () => {
    answer("(min-width: 1024px)");

    const { result } = renderHook(() => useMediaQuery("(min-width: 640px)"));

    expect(result.current).toBe(false);
  });
});
