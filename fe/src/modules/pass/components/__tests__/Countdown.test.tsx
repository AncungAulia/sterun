/**
 * The countdown is a value read off the clock, not an animation, so it is
 * tested as a number and a width rather than as movement.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Countdown } from "@/modules/pass/components/Countdown";

describe("Countdown", () => {
  it("says when the next code arrives", () => {
    render(<Countdown secondsLeft={19} />);
    expect(screen.getByText("New code in 19s")).toBeInTheDocument();
  });

  it("fills its track by how much of the step is left", () => {
    render(<Countdown secondsLeft={15} />);
    expect(screen.getByTestId("countdown-fill")).toHaveStyle({ width: "50%" });
  });

  it("is still drawing something in the last second, never an empty track", () => {
    render(<Countdown secondsLeft={1} />);
    expect(screen.getByTestId("countdown-fill")).not.toHaveStyle({ width: "0%" });
  });
});
