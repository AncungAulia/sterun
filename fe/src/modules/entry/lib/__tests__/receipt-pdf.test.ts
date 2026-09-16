/**
 * The receipt's logo raster. Everything else in receipt-pdf.ts is layout, and
 * the words it lays out are tested in receipt.test.ts; this is the one number
 * in it that decides whether a receipt is 90 KB or 30 MB.
 */
import { describe, expect, it } from "vitest";

import { LOGO_RASTER_HEIGHT_PX, logoRasterSize } from "@/modules/entry/lib/receipt-pdf";

describe("logoRasterSize", () => {
  it("paints the lockup small enough for a page, at its own proportions", () => {
    // The SVG's own size: 1245 by 400.
    const size = logoRasterSize(1245, 400);

    expect(size).toEqual({ width: 299, height: LOGO_RASTER_HEIGHT_PX });
    expect(size.width / size.height).toBeCloseTo(1245 / 400, 1);
  });

  it("stays under fifty thousand pixels, where the old four-times canvas was nearly eight million", () => {
    const { width, height } = logoRasterSize(1245, 400);
    expect(width * height).toBeLessThan(50_000);
    expect(1245 * 4 * 400 * 4).toBeGreaterThan(7_900_000);
  });

  it("is still sharp enough to print: the 16 pt logo needs 67 px at 300 dpi", () => {
    expect(LOGO_RASTER_HEIGHT_PX).toBeGreaterThanOrEqual(Math.ceil((16 / 72) * 300));
  });

  it("does not depend on how large the SVG says it is", () => {
    expect(logoRasterSize(12450, 4000)).toEqual(logoRasterSize(1245, 400));
  });
});
