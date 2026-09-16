/**
 * The manual fallback. A code is six characters including any leading zero,
 * and a volunteer types all six (docs/specs/HASH_AND_TOTP.md section 4.4).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CodeRow } from "@/modules/pass/components/CodeRow";

describe("CodeRow", () => {
  it("shows all six characters, leading zero included", () => {
    render(<CodeRow code="079663" />);

    expect(screen.getByText("Or use the code")).toBeInTheDocument();
    expect(screen.getByLabelText("Check-in code 079663")).toHaveTextContent("079663");
  });

  it("reads the code out once, rather than as six separate things", () => {
    render(<CodeRow code="844761" />);
    expect(screen.getAllByLabelText(/^Check-in code/)).toHaveLength(1);
  });
});

/**
 * The one movement this row is allowed (the design, section 6.2, M3): the six
 * characters roll in turn when the code changes. It may never delay a reading,
 * so every character is on screen and correct from the first frame.
 */
describe("the roll", () => {
  it("rolls each character in turn when the code changes", () => {
    const { rerender } = render(<CodeRow code="079663" />);
    rerender(<CodeRow code="844761" />);

    const characters = screen.getAllByTestId("code-character");
    expect(characters).toHaveLength(6);
    expect(characters.map((c) => c.textContent).join("")).toBe("844761");
    expect(characters[2]).toHaveStyle({ animationDelay: "50ms" });
  });

  it("gives each character a key that changes with the code, so the roll runs again", () => {
    const { rerender } = render(<CodeRow code="079663" />);
    const before = screen.getAllByTestId("code-character")[0];

    rerender(<CodeRow code="844761" />);

    // A key tied to the position alone updates the text in place and the
    // animation never restarts, which is a roll nobody ever sees.
    expect(screen.getAllByTestId("code-character")[0]).not.toBe(before);
  });
});
