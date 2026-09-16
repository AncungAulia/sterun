/**
 * The frame loop, with the decoder mocked to whatever the "camera" is looking
 * at. The decoder itself is tested against a real QR in lib/__tests__.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createDecoder = vi.hoisted(() => vi.fn());
vi.mock("@/modules/scanner/lib/decoder", () => ({ createDecoder }));

import { useQrReader } from "@/modules/scanner/hooks/useQrReader";

const PASS_A = '{"t":7,"s":59070111,"c":"079663"}';
const PASS_B = '{"t":7,"s":59070112,"c":"123456"}';

let inFrame: string | null = null;
const decode = vi.fn(async () => inFrame);
const videoRef = { current: {} as HTMLVideoElement };

beforeEach(() => {
  inFrame = null;
  decode.mockClear();
  createDecoder.mockReset();
  createDecoder.mockResolvedValue({ decode, engine: "jsqr" });
});

describe("useQrReader", () => {
  it("hands over a pass once, parsed", async () => {
    const onRead = vi.fn();
    inFrame = PASS_A;

    const { result } = renderHook(() => useQrReader({ videoRef, running: true, paused: false, onRead }));

    await waitFor(() => expect(onRead).toHaveBeenCalledTimes(1));
    expect(onRead).toHaveBeenCalledWith({ tokenId: 7, step: 59070111, code: "079663" });
    expect(result.current).toEqual({ state: "ready", engine: "jsqr" });
  });

  it("keeps looking past anything that is not a pass", async () => {
    const onRead = vi.fn();
    inFrame = "https://example.com/parking";

    renderHook(() => useQrReader({ videoRef, running: true, paused: false, onRead }));

    await waitFor(() => expect(decode.mock.calls.length).toBeGreaterThan(2));
    expect(onRead).not.toHaveBeenCalled();

    inFrame = PASS_A;
    await waitFor(() => expect(onRead).toHaveBeenCalledTimes(1));
  });

  it("reads nothing while a verdict is on screen", async () => {
    const onRead = vi.fn();
    inFrame = PASS_A;

    renderHook(() => useQrReader({ videoRef, running: true, paused: true, onRead }));

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(decode).not.toHaveBeenCalled();
    expect(onRead).not.toHaveBeenCalled();
  });

  it("does not hand the same code over twice, so a runner cannot trip over their own scan", async () => {
    const onRead = vi.fn();
    inFrame = PASS_A;

    const { rerender } = renderHook(
      ({ paused }) => useQrReader({ videoRef, running: true, paused, onRead }),
      { initialProps: { paused: false } },
    );
    await waitFor(() => expect(onRead).toHaveBeenCalledTimes(1));

    // The verdict shows, then the volunteer dismisses it with the same phone
    // still held up.
    rerender({ paused: true });
    rerender({ paused: false });
    await waitFor(() => expect(decode.mock.calls.length).toBeGreaterThan(3));
    expect(onRead).toHaveBeenCalledTimes(1);

    // The pass rolls to the next step: that is a new scan.
    inFrame = PASS_B;
    await waitFor(() => expect(onRead).toHaveBeenCalledTimes(2));
  });

  it("waits for the camera before reading a frame", async () => {
    const onRead = vi.fn();
    inFrame = PASS_A;

    renderHook(() => useQrReader({ videoRef, running: false, paused: false, onRead }));

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(decode).not.toHaveBeenCalled();
  });

  it("says so when no decoder could load, so the desk can fall back to typing", async () => {
    createDecoder.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() =>
      useQrReader({ videoRef, running: true, paused: false, onRead: vi.fn() }),
    );

    await waitFor(() => expect(result.current.state).toBe("unavailable"));
  });
});
