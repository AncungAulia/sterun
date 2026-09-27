import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ClockBanner } from "@/modules/scanner/components/ClockBanner";

describe("ClockBanner", () => {
  it("says how far off the clock is, which way, and how to fix it", () => {
    render(<ClockBanner driftSeconds={240} checking={false} onCheckAgain={vi.fn()} />);

    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent("This phone's clock is 4 minutes fast");
    expect(banner).toHaveTextContent("Scans will fail until it is fixed.");
  });

  it("checks again on request, and says it is checking", async () => {
    const onCheckAgain = vi.fn();
    const { rerender } = render(<ClockBanner driftSeconds={-95} checking={false} onCheckAgain={onCheckAgain} />);

    expect(screen.getByRole("alert")).toHaveTextContent("95 seconds slow");
    await userEvent.click(screen.getByRole("button", { name: "I fixed it, check again" }));
    expect(onCheckAgain).toHaveBeenCalled();

    rerender(<ClockBanner driftSeconds={-95} checking onCheckAgain={onCheckAgain} />);
    expect(screen.getByRole("button", { name: "Checking" })).toBeDisabled();
  });
});
