"use client";

/**
 * Reads frames from a running camera until one holds a pass, then hands the
 * parsed payload over once.
 *
 * ## Pacing
 *
 * One frame every 150 ms, not every animation frame. jsQR on a mid-range
 * phone takes tens of milliseconds a frame, and a loop that never rests starves
 * the camera preview the volunteer is aiming with. Seven reads a second is well
 * inside the two-second verdict and leaves the preview smooth.
 *
 * ## Once per code
 *
 * A QR held in front of the camera is in every frame for as long as it is held.
 * The reader stops while `paused` (a verdict is on screen), and it refuses to
 * hand over the same text twice in a row, so a runner who keeps their phone up
 * after GREEN does not produce ALREADY CLAIMED from their own scan a moment
 * later. A new step changes the text, so the next real scan still goes through.
 *
 * Anything that is not a pass (a poster, a parking ticket, half a code) is
 * dropped by `parsePayload` and the loop simply carries on.
 */
import { useEffect, useRef, useState, type RefObject } from "react";

import { createDecoder, type DecoderEngine } from "../lib/decoder";
import { parsePayload, type ScannedCode } from "../lib/payload";

export const FRAME_INTERVAL_MS = 150;

export type ReaderState = "loading" | "ready" | "unavailable";

export function useQrReader({
  videoRef,
  running,
  paused,
  onRead,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** The camera is delivering frames. */
  running: boolean;
  /** A verdict is on screen; read nothing until it is dismissed. */
  paused: boolean;
  onRead: (scanned: ScannedCode) => void;
}) {
  const [state, setState] = useState<ReaderState>("loading");
  const [engine, setEngine] = useState<DecoderEngine | null>(null);
  const decodeRef = useRef<((video: HTMLVideoElement) => Promise<string | null>) | null>(null);
  const lastText = useRef<string | null>(null);
  // The latest callback without restarting the loop every render.
  const onReadRef = useRef(onRead);
  useEffect(() => {
    onReadRef.current = onRead;
  }, [onRead]);

  useEffect(() => {
    let cancelled = false;
    createDecoder()
      .then(({ decode, engine: chosen }) => {
        if (cancelled) return;
        decodeRef.current = decode;
        setEngine(chosen);
        setState("ready");
      })
      .catch(() => {
        // jsQR failed to load: most likely a first visit with no signal. The
        // desk still has manual entry, which is the floor this screen keeps.
        if (!cancelled) setState("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state !== "ready" || !running || paused) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      const video = videoRef.current;
      const decode = decodeRef.current;
      if (video && decode) {
        const text = await decode(video);
        if (stopped) return;
        if (text !== null && text !== lastText.current) {
          const scanned = parsePayload(text);
          if (scanned) {
            lastText.current = text;
            onReadRef.current(scanned);
            // The parent pauses the reader by showing a verdict; no further tick.
            return;
          }
        }
      }
      if (!stopped) timer = setTimeout(tick, FRAME_INTERVAL_MS);
    };

    timer = setTimeout(tick, FRAME_INTERVAL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [state, running, paused, videoRef]);

  return { state, engine };
}
