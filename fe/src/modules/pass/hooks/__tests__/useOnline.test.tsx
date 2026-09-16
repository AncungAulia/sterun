/**
 * Whether the phone thinks it has a signal. It drives one banner and nothing
 * else, which is why the browser's own events are enough here.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useOnline } from "@/modules/pass/hooks/useOnline";

afterEach(() => vi.restoreAllMocks());

describe("useOnline", () => {
  it("follows the browser's offline and online events", () => {
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);

    act(() => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);

    act(() => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
  });

  it("starts from what the browser already knows, not from an assumption", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(false);
  });
});
