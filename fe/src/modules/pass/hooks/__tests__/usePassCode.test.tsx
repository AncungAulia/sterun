/**
 * The pass's clock. Fake timers throughout: a test that waits 30 real seconds
 * for a rollover is a test nobody runs, and one that stubs the code generator
 * would prove nothing about the thing that matters.
 *
 * The secret and the expected code are vector tp-02 from
 * docs/specs/vectors/totp.json, so a wrong code here is a wrong code at a desk.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePassCode } from "@/modules/pass/hooks/usePassCode";

const SECRET = "4d7b1e93a05c26f8d3407e91b6c258aa0f31d74e69b2085c1a3f6d904e7c2b15";
/** 1772103330: step 59070111, code 079663, and 20 seconds into that step. */
const INSIDE_THE_STEP = 1772103330_000;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(INSIDE_THE_STEP);
});
afterEach(() => vi.useRealTimers());

describe("usePassCode", () => {
  it("gives the code and the payload for the step the phone is in", async () => {
    const { result } = renderHook(() => usePassCode(7, SECRET));

    await waitFor(() => expect(result.current.code).toBe("079663"));
    expect(result.current.step).toBe(59070111);
    expect(result.current.payload).toBe('{"t":7,"s":59070111,"c":"079663"}');
  });

  it("counts down inside the step without changing the code", async () => {
    const { result } = renderHook(() => usePassCode(7, SECRET));
    await waitFor(() => expect(result.current.code).toBe("079663"));
    const before = result.current.secondsLeft;

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.secondsLeft).toBe(before - 3);
    expect(result.current.code).toBe("079663");
  });

  it("makes a new code when the step rolls over", async () => {
    const { result } = renderHook(() => usePassCode(7, SECRET));
    await waitFor(() => expect(result.current.code).toBe("079663"));

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    await waitFor(() => expect(result.current.step).toBe(59070112));
    await waitFor(() => expect(result.current.code).not.toBe("079663"));
    expect(result.current.code).toHaveLength(6);
  });

  it("never pairs a new step with the code from the old one", async () => {
    const { result } = renderHook(() => usePassCode(7, SECRET));
    await waitFor(() => expect(result.current.code).toBe("079663"));

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    /*
      While the next code is being computed there is no code at all, rather
      than the previous step's digits under this step's number. A scanner
      refuses that pairing, and the runner holding the phone looks like the
      one who got it wrong.
    */
    expect(result.current.payload).not.toBe('{"t":7,"s":59070112,"c":"079663"}');

    await waitFor(() => expect(result.current.code).not.toBeNull());
    expect(result.current.payload).toBe(`{"t":7,"s":59070112,"c":"${result.current.code}"}`);
  });

  it("asks for nothing when this device has no secret", async () => {
    const { result } = renderHook(() => usePassCode(7, null));

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.code).toBeNull();
    expect(result.current.payload).toBeNull();
  });

  it("shows no code rather than a wrong one when the secret cannot be used", async () => {
    const { result } = renderHook(() => usePassCode(7, "not-a-secret"));

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.code).toBeNull();
    expect(result.current.payload).toBeNull();
  });
});
