/**
 * The QR itself. Its only job is to carry the payload a scanner reads, so what
 * is asserted is that a code appears and that it is replaced when the payload
 * changes, never how it looks.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PassQr } from "@/modules/pass/components/PassQr";

const PAYLOAD = '{"t":7,"s":59070111,"c":"079663"}';

describe("PassQr", () => {
  it("draws the payload as an SVG the camera can read", async () => {
    render(<PassQr payload={PAYLOAD} />);

    const qr = await screen.findByRole("img", { name: "Your check-in code as a QR" });
    await waitFor(() => expect(qr.querySelector("svg")).not.toBeNull());
  });

  it("redraws when the code rolls over", async () => {
    const { rerender } = render(<PassQr payload={PAYLOAD} />);
    const qr = await screen.findByRole("img", { name: "Your check-in code as a QR" });
    await waitFor(() => expect(qr.innerHTML).not.toBe(""));
    const first = qr.innerHTML;

    rerender(<PassQr payload={'{"t":7,"s":59070112,"c":"111111"}'} />);

    await waitFor(() => expect(qr.innerHTML).not.toBe(first));
  });
});
