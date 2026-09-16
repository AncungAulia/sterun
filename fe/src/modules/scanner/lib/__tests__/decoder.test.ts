/**
 * The decoder. The jsQR path is tested against a real QR: drawn by `qrcode`,
 * the library the runner's pass draws with, from a frozen payload. So a pass
 * this repository produces is proven readable by the engine every iPhone desk
 * will use, with no camera involved.
 */
import QRCode from "qrcode";
import { describe, expect, it, vi } from "vitest";

import { createDecoder } from "@/modules/scanner/lib/decoder";

const PAYLOAD = '{"t":7,"s":59070111,"c":"079663"}';

/** A QR as RGBA pixels: `scale` pixels per module, with a four-module quiet zone. */
function qrPixels(text: string, scale = 4) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const quiet = 4;
  const size = (modules.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);

  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (!modules.get(row, col)) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const y = (row + quiet) * scale + dy;
          const x = (col + quiet) * scale + dx;
          const i = (y * size + x) * 4;
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
        }
      }
    }
  }
  return { data, size };
}

/** A canvas that hands back whatever frame the test put in front of the "camera". */
function fakeCanvas(frame: { data: Uint8ClampedArray; size: number } | null) {
  const context = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => {
      if (!frame) throw new Error("no frame");
      return { data: frame.data, width: frame.size, height: frame.size };
    }),
  };
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => context) };
  return { canvas: canvas as unknown as HTMLCanvasElement, context };
}

function fakeVideo(size: number) {
  return { videoWidth: size, videoHeight: size } as HTMLVideoElement;
}

describe("where the browser reads QR natively", () => {
  it("uses BarcodeDetector and never loads jsQR", async () => {
    const detect = vi.fn(async () => [{ rawValue: PAYLOAD }]);
    const loadJsQr = vi.fn();
    class Native {
      static getSupportedFormats = async () => ["ean_13", "qr_code"];
      detect = detect;
    }

    const { decode, engine } = await createDecoder({ barcodeDetector: Native, loadJsQr });

    expect(engine).toBe("native");
    expect(await decode(fakeVideo(100))).toBe(PAYLOAD);
    expect(loadJsQr).not.toHaveBeenCalled();
  });

  it("answers null for a frame with nothing in it, and for one it failed to read", async () => {
    let calls = 0;
    class Native {
      static getSupportedFormats = async () => ["qr_code"];
      detect = async () => {
        calls += 1;
        if (calls === 1) return [];
        throw new Error("frame not ready");
      };
    }

    const { decode } = await createDecoder({ barcodeDetector: Native });
    expect(await decode(fakeVideo(100))).toBeNull();
    expect(await decode(fakeVideo(100))).toBeNull();
  });
});

describe("where it does not", () => {
  it("falls back to jsQR when the constructor exists but reads no QR, like desktop Chrome on Windows", async () => {
    class Empty {
      static getSupportedFormats = async () => [];
      detect = async () => [];
    }
    const frame = qrPixels(PAYLOAD);
    const { canvas } = fakeCanvas(frame);

    const { decode, engine } = await createDecoder({ barcodeDetector: Empty, makeCanvas: () => canvas });

    expect(engine).toBe("jsqr");
    expect(await decode(fakeVideo(frame.size))).toBe(PAYLOAD);
  });

  it("reads a real pass QR with jsQR, leading zero and all", async () => {
    const frame = qrPixels(PAYLOAD);
    const { canvas } = fakeCanvas(frame);

    const { decode, engine } = await createDecoder({ barcodeDetector: undefined, makeCanvas: () => canvas });

    expect(engine).toBe("jsqr");
    const text = await decode(fakeVideo(frame.size));
    expect(text).toBe(PAYLOAD);
    expect(JSON.parse(text!).c).toBe("079663");
  });

  it("answers null for a blank frame, and for a video with no picture yet", async () => {
    const blank = { data: new Uint8ClampedArray(120 * 120 * 4).fill(255), size: 120 };
    const { canvas, context } = fakeCanvas(blank);

    const { decode } = await createDecoder({ barcodeDetector: undefined, makeCanvas: () => canvas });

    expect(await decode(fakeVideo(120))).toBeNull();
    // A camera that has not delivered its first frame reports 0 x 0.
    context.drawImage.mockClear();
    expect(await decode(fakeVideo(0))).toBeNull();
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it("answers null rather than throwing when the frame cannot be read", async () => {
    const { canvas } = fakeCanvas(null);
    const { decode } = await createDecoder({ barcodeDetector: undefined, makeCanvas: () => canvas });

    expect(await decode(fakeVideo(100))).toBeNull();
  });
});
