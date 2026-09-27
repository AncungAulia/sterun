"use client";

/**
 * S2: the camera, the frame to aim with, and the way to type instead.
 *
 * The video fills the space and the frame sits over it. The frame is a guide,
 * not a crop: the decoder reads the whole picture, so a pass held a little off
 * centre still scans.
 */
import type { RefObject } from "react";

import { Button } from "@/components/ui/button";

export interface CameraFrameProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  onType: () => void;
  /**
   * A verdict or the typing sheet is over the camera. The camera stays mounted
   * (its video holds the stream), so it is taken out of reach instead: without
   * this a keyboard tabs into buttons nobody can see, and a screen reader reads
   * two "Type the code instead" buttons, one of them underneath.
   */
  covered?: boolean;
}

function Corner({ className }: { className: string }) {
  return <span aria-hidden className={`absolute size-10 border-paper ${className}`} />;
}

export function CameraFrame({ videoRef, onType, covered = false }: CameraFrameProps) {
  return (
    <div
      inert={covered}
      aria-hidden={covered || undefined}
      className="relative flex flex-1 flex-col overflow-hidden bg-n-950"
    >
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label="Camera"
        className="absolute inset-0 size-full object-cover"
      />

      <div className="relative flex flex-1 items-center justify-center p-8">
        <div className="relative aspect-square w-full max-w-72">
          <Corner className="top-0 left-0 rounded-tl-md border-t-4 border-l-4" />
          <Corner className="top-0 right-0 rounded-tr-md border-t-4 border-r-4" />
          <Corner className="bottom-0 left-0 rounded-bl-md border-b-4 border-l-4" />
          <Corner className="right-0 bottom-0 rounded-br-md border-r-4 border-b-4" />
        </div>
      </div>

      <div className="relative flex flex-col gap-3 bg-gradient-to-t from-n-950 via-n-950/80 to-transparent px-5 pt-10 pb-6">
        <p className="text-center text-base text-n-100">Hold the runner&apos;s QR inside the frame</p>
        <Button className="h-14 w-full bg-n-100 text-base text-ink hover:bg-n-200" onClick={onType}>
          Type the code instead
        </Button>
      </div>
    </div>
  );
}
