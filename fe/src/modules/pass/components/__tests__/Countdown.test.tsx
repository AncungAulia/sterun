/**
 * The countdown is a value read off the clock, not an animation, so it is
 * tested as a number and a scale rather than as movement.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Countdown } from "@/modules/pass/components/Countdown";

describe("Countdown", () => {
  it("says when the next code arrives", () => {
    render(<Countdown secondsLeft={19} step={59070111} />);
    expect(screen.getByText("New code in 19s")).toBeInTheDocument();
  });

  it("fills its track by how much of the step is left", () => {
    render(<Countdown secondsLeft={15} step={59070111} />);
    expect(screen.getByTestId("countdown-fill")).toHaveStyle({ transform: "scaleX(0.5)" });
  });

  it("is still drawing something in the last second, never an empty track", () => {
    render(<Countdown secondsLeft={1} step={59070111} />);
    const fill = screen.getByTestId("countdown-fill");
    expect(fill).not.toHaveStyle({ transform: "scaleX(0)" });
  });

  it("glides between ticks rather than jumping once a second", () => {
    render(<Countdown secondsLeft={15} step={59070111} />);
    // The clock is read once a second, and a bar driven straight off that
    // number stutters. The class carries the transition that smooths it.
    expect(screen.getByTestId("countdown-fill")).toHaveClass("pass-countdown");
  });

  it("starts a fresh bar when the code rolls over", () => {
    const { rerender } = render(<Countdown secondsLeft={1} step={59070111} />);
    const before = screen.getByTestId("countdown-fill");

    rerender(<Countdown secondsLeft={30} step={59070112} />);

    // A kept element would glide from empty back to full over a second, which
    // reads as the code being put back rather than replaced.
    expect(screen.getByTestId("countdown-fill")).not.toBe(before);
  });
});
