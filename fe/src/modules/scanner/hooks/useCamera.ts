"use client";

/**
 * The back camera, running for as long as the desk screen is open.
 *
 * Four states, because each one is a different screen for the volunteer:
 *
 *   - `starting` — asking. The browser's own permission prompt may be up.
 *   - `running` — frames are arriving.
 *   - `denied` — the volunteer (or a setting) said no. Manual entry opens, with
 *     one line on how to undo it.
 *   - `absent` — there is no camera, or the browser cannot reach one. Manual
 *     entry opens without that line, since there is nothing to allow.
 *
 * Every track is stopped on unmount. A camera left running behind a closed
 * screen is a hot phone and a flat battery at a desk that runs for hours, and
 * on some Android builds it also keeps the next `getUserMedia` from starting.
 */
import { useEffect, useRef, useState } from "react";

export type CameraState = "starting" | "running" | "denied" | "absent";

export function useCamera(enabled = true) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<CameraState>("starting");

  useEffect(() => {
    if (!enabled) return;

    let stream: MediaStream | null = null;
    let cancelled = false;

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("absent");
        return;
      }

      try {
        const opened = await navigator.mediaDevices.getUserMedia({
          // `ideal`, not `exact`: a tablet with only a front camera still scans.
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          // The screen closed while the prompt was up. Give the camera back at
          // once rather than holding it for a component that no longer exists.
          opened.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = opened;

        const video = videoRef.current;
        if (video) {
          video.srcObject = opened;
          // A promise that rejects when autoplay is refused. It is not, for a
          // muted inline video, but an unhandled rejection is still noise.
          await video.play().catch(() => {});
        }
        setState("running");
      } catch (error) {
        if (cancelled) return;
        const name = (error as { name?: string }).name;
        setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "absent");
      }
    };

    void start();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [enabled]);

  return { videoRef, state };
}
