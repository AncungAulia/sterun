/**
 * The camera's four states, against a stubbed `navigator.mediaDevices`. jsdom
 * has no camera, which is the point: what is tested is how the desk reacts to
 * each thing a real phone can answer.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCamera } from "@/modules/scanner/hooks/useCamera";

const original = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");

function stubMedia(getUserMedia: (() => Promise<unknown>) | undefined) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: getUserMedia ? { getUserMedia: vi.fn(getUserMedia) } : undefined,
  });
}

function fakeStream() {
  const track = { stop: vi.fn() };
  return { stream: { getTracks: () => [track] } as unknown as MediaStream, track };
}

function namedError(name: string) {
  return Object.assign(new Error(name), { name });
}

afterEach(() => {
  if (original) Object.defineProperty(navigator, "mediaDevices", original);
  else delete (navigator as { mediaDevices?: unknown }).mediaDevices;
});

describe("useCamera", () => {
  it("runs once the back camera is granted, and asks for the back one", async () => {
    const { stream } = fakeStream();
    stubMedia(async () => stream);

    const { result } = renderHook(() => useCamera());
    expect(result.current.state).toBe("starting");

    await waitFor(() => expect(result.current.state).toBe("running"));
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
  });

  it("is denied when the volunteer says no", async () => {
    stubMedia(async () => {
      throw namedError("NotAllowedError");
    });

    const { result } = renderHook(() => useCamera());
    await waitFor(() => expect(result.current.state).toBe("denied"));
  });

  it("is absent when the phone has no camera", async () => {
    stubMedia(async () => {
      throw namedError("NotFoundError");
    });

    const { result } = renderHook(() => useCamera());
    await waitFor(() => expect(result.current.state).toBe("absent"));
  });

  it("is absent when the browser cannot reach a camera at all", async () => {
    // An http page on a phone: getUserMedia is simply not there.
    stubMedia(undefined);

    const { result } = renderHook(() => useCamera());
    await waitFor(() => expect(result.current.state).toBe("absent"));
  });

  it("stops every track when the screen closes", async () => {
    const { stream, track } = fakeStream();
    stubMedia(async () => stream);

    const { result, unmount } = renderHook(() => useCamera());
    await waitFor(() => expect(result.current.state).toBe("running"));

    unmount();
    expect(track.stop).toHaveBeenCalled();
  });

  it("gives the camera straight back when the screen closed while the prompt was up", async () => {
    const { stream, track } = fakeStream();
    let grant!: (value: MediaStream) => void;
    stubMedia(() => new Promise((resolve) => (grant = resolve as typeof grant)));

    const { unmount } = renderHook(() => useCamera());
    unmount();
    grant(stream);

    await waitFor(() => expect(track.stop).toHaveBeenCalled());
  });

  it("asks for nothing while it is switched off", () => {
    const { stream } = fakeStream();
    stubMedia(async () => stream);

    renderHook(() => useCamera(false));
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });
});
