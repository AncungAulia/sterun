/**
 * Whether the phone thinks it has a signal. It drives one banner and nothing
 * else, which is why the browser's own events are enough here.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useOnline } from "@/modules/pass/hooks/useOnline";

/**
 * jsdom has no network, so the property the hook reads is redefined and put
 * back afterwards. Not a spy: restoring a getter jsdom defines as a plain
 * value is unreliable, and a `navigator.onLine` that throws takes down every
 * render that follows it.
 */
function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
}

afterEach(() => setOnline(true));

describe("useOnline", () => {
  it("follows the browser's offline and online events", () => {
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
  });

  it("starts from what the browser already knows, not from an assumption", () => {
    setOnline(false);
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(false);
  });
});
