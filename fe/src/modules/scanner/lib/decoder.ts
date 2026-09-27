/**
 * Turns one camera frame into the text of the QR in it, or into nothing.
 *
 * Two engines behind one function, chosen once (design §2, decision 1):
 *
 *   - **`BarcodeDetector`**, where the browser has it and says it reads QR. On
 *     Chrome for Android this decodes natively, which is the fast path and the
 *     common desk phone.
 *   - **`jsQR`** everywhere else, which today means every iPhone. Plain
 *     JavaScript with no WebAssembly file, so there is no second asset for the
 *     service worker to have missed on the morning it matters. Loaded only when
 *     it is needed, so an Android desk never downloads it.
 *
 * Having the constructor is not the same as reading QR: desktop Chrome on
 * Windows exposes `BarcodeDetector` and supports no formats at all. So the
 * check is `getSupportedFormats()`, not `"BarcodeDetector" in window`.
 *
 * A frame with no code in it is `null`. So is a frame the engine could not
 * read for any reason: the next frame is 150 ms away, and a desk has nothing
 * to do with an exception about one blurry picture.
 */

/** The slice of the Barcode Detection API this file uses. TypeScript's DOM lib does not declare it. */
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
interface BarcodeDetectorClass {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
}

export type Decoder = (video: HTMLVideoElement) => Promise<string | null>;

export type DecoderEngine = "native" | "jsqr";

export interface DecoderDeps {
  barcodeDetector?: BarcodeDetectorClass;
  loadJsQr?: () => Promise<typeof import("jsqr").default>;
  makeCanvas?: () => HTMLCanvasElement;
}

const DEFAULTS = {
  loadJsQr: async () => (await import("jsqr")).default,
  makeCanvas: () => document.createElement("canvas"),
};

async function nativeReadsQr(detector: BarcodeDetectorClass | undefined): Promise<boolean> {
  if (!detector) return false;
  try {
    return (await detector.getSupportedFormats()).includes("qr_code");
  } catch {
    return false;
  }
}

export async function createDecoder(
  deps: DecoderDeps = {},
): Promise<{ decode: Decoder; engine: DecoderEngine }> {
  const { loadJsQr, makeCanvas } = { ...DEFAULTS, ...deps };
  // `in`, not `??`: a test passes `barcodeDetector: undefined` to mean "this
  // browser has none", and that must not fall back to the real global.
  const barcodeDetector =
    "barcodeDetector" in deps
      ? deps.barcodeDetector
      : (globalThis as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector;

  if (barcodeDetector && (await nativeReadsQr(barcodeDetector))) {
    const detector = new barcodeDetector({ formats: ["qr_code"] });
    return {
      engine: "native",
      decode: async (video) => {
        try {
          const found = await detector.detect(video);
          return found[0]?.rawValue ?? null;
        } catch {
          return null;
        }
      },
    };
  }

  const jsQR = await loadJsQr();
  // One canvas for the life of the desk. A new one per frame is garbage a
  // mid-range phone collects in the middle of someone's scan.
  const canvas = makeCanvas();
  const context = canvas.getContext("2d", { willReadFrequently: true });

  return {
    engine: "jsqr",
    decode: async (video) => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!context || width === 0 || height === 0) return null;

      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      try {
        context.drawImage(video, 0, 0, width, height);
        const frame = context.getImageData(0, 0, width, height);
        // "dontInvert": a pass is dark modules on a light ground, always, and
        // trying the inverse doubles the work on every frame for nothing.
        return jsQR(frame.data, width, height, { inversionAttempts: "dontInvert" })?.data ?? null;
      } catch {
        return null;
      }
    },
  };
}
