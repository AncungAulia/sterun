/**
 * The facts row on the pass, and the one fact a desk cannot do without: the bib
 * number, which is half of the frozen manual fallback (HASH_AND_TOTP.md §5).
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PassFacts } from "@/modules/pass/components/PassFacts";

/** The labels of the facts row, in order. */
function terms() {
  return within(document.querySelector("dl")!).getAllByRole("term").map((term) => term.textContent);
}

describe("PassFacts", () => {
  it("puts the bib number first in the row, beside the distance and the state", () => {
    render(<PassFacts raceName="Sasando Run 2026" distanceCode="10K" bibNo={128} bibName="SARI" claimed={false} />);

    expect(terms()).toEqual(["Bib", "Distance", "Status"]);
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getByText("SARI")).toBeInTheDocument();
    expect(document.querySelector("dl")).toHaveClass("grid-cols-3");
  });

  it("wraps four facts into two rows, so the state still fits on a phone", () => {
    render(
      <PassFacts raceName="Sasando Run 2026" distanceCode="10K" city="Kupang" bibNo={128} bibName="SARI" claimed />,
    );

    expect(terms()).toEqual(["Bib", "Distance", "Where", "Status"]);
    expect(document.querySelector("dl")).toHaveClass("grid-cols-2");
    expect(screen.getByText("Race pack claimed")).toBeInTheDocument();
  });

  it("shows the number once, large, on a phone that holds no bib name", () => {
    render(<PassFacts raceName="Sasando Run 2026" distanceCode="10K" bibNo={128} claimed={false} />);

    expect(terms()).toEqual(["Distance", "Status"]);
    expect(screen.getAllByText("128")).toHaveLength(1);
  });
});
