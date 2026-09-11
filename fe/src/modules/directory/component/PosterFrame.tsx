"use client";

/**
 * A race poster in a fixed 16:9 frame, whatever shape the poster is.
 *
 * Posters arrive in every shape (the ones on testnet today are 3:1, 4:3 and
 * about 10:7) and they carry their own title, date and venue as text. Cropping
 * one to fill the frame cuts that text off, so the poster is always shown
 * whole, and the space it leaves is filled with a blurred, dimmed copy of the
 * same picture. A 16:9 poster, which the wizard recommends, fills the frame
 * exactly and the copy never shows.
 *
 * The blur stays at 16px: heavy blur is expensive to paint, worst in Safari.
 */
import { ImageOffIcon } from "lucide-react";
import Image from "next/image";
import { useState, type ReactNode } from "react";

import { cn } from "@/utils/cn";

interface PosterFrameProps {
  posterUrl: string | null;
  /** The document is still on its way, so whether there is a poster is not known yet. */
  loading: boolean;
  sizes: string;
  className?: string;
  /** Drawn over the picture, e.g. the status badge. */
  children?: ReactNode;
}

export function PosterFrame({ posterUrl, loading, sizes, className, children }: PosterFrameProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const showPoster = posterUrl !== null && failedUrl !== posterUrl;

  return (
    <div className={cn("relative aspect-video w-full overflow-hidden bg-n-100", className)}>
      {showPoster ? (
        <>
          {/*
            Poster URLs come from organisers and can live on any host, so both
            layers are shown as-is (`unoptimized`, same as the event page's
            poster) rather than through Next's image optimiser, which would need
            every host allow-listed. `scale-125` pushes the blur's soft,
            see-through edge outside the frame.
          */}
          <Image
            src={posterUrl}
            alt=""
            aria-hidden
            fill
            unoptimized
            sizes={sizes}
            className="scale-125 object-cover blur-lg"
          />
          <div aria-hidden className="absolute inset-0 bg-ink/40" />
          <Image
            src={posterUrl}
            alt=""
            fill
            unoptimized
            sizes={sizes}
            onLoad={() => setLoadedUrl(posterUrl)}
            onError={() => setFailedUrl(posterUrl)}
            className={cn(
              "object-contain transition-opacity duration-200 ease-out motion-reduce:transition-none",
              loadedUrl === posterUrl ? "opacity-100" : "opacity-0",
            )}
          />
        </>
      ) : null}

      {!showPoster && !loading ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-n-500">
          <ImageOffIcon aria-hidden className="size-6" />
          <span className="text-sm">No image</span>
        </div>
      ) : null}

      {children}
    </div>
  );
}
