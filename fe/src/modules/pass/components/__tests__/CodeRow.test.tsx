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

    expect(screen.getByText("Camera not working? Read these out")).toBeInTheDocument();
    expect(screen.getByLabelText("Check-in code 079663")).toHaveTextContent("079663");
  });

  it("reads the code out once, rather than as six separate things", () => {
    render(<CodeRow code="844761" />);
    expect(screen.getAllByLabelText(/^Check-in code/)).toHaveLength(1);
  });
});
