"use client";

/**
 * The payload as a QR, drawn on this phone.
 *
 * Never animated, in or out (docs/design/race-day/README.md section 6.3): a
 * camera pointed at a half-drawn code can read it, and reading it wrong is
 * worse than reading nothing. The new code replaces the old one in one tick.
 *
 * `toString` is asynchronous, so the previous QR stays on screen until the next
 * one is ready rather than blinking through an empty box. The library is
 * imported on use: nothing else in the app draws a QR, and the pass is the one
 * screen that must load with the network off, so its cost belongs here.
 *
 * The markup is inserted as HTML because that is what an SVG renderer returns.
 * What goes in is a string this app built out of a token id, a step number and
 * six digits (`lib/totp.ts`), never anything a person typed.
 */
import { useEffect, useState } from "react";

export function PassQr({ payload }: { payload: string }) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let current = true;
    void import("qrcode").then(async ({ default: QRCode }) => {
      // M is the level the design's samples were generated at: enough
      // redundancy for a screen with fingerprints on it, without crowding the
      // modules so tightly that a cheap camera gives up.
      const next = await QRCode.toString(payload, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 1,
      });
      if (current) setSvg(next);
    });
    return () => {
      current = false;
    };
  }, [payload]);

  return (
    <div
      role="img"
      aria-label="Your check-in code as a QR"
      className="mx-auto aspect-square w-full max-w-67 [&>svg]:size-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
