import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DistanceRings } from "@/modules/organiser/component/DistanceRings";
import { EntriesPerDay } from "@/modules/organiser/component/EntriesPerDay";
import type { SterunCategory } from "@sterunxyz/sdk";

const NOW = 1_788_000_000n;

function category(
  code: string,
  distanceM: number,
  quota: number,
  enteredCount: number,
): SterunCategory {
  return {
    eventId: 4,
    categoryId: distanceM,
    code,
    distanceM,
    quota,
    enteredCount,
    priceStroops: 0n,
    slotsLeft: quota - enteredCount,
  };
}

describe("EntriesPerDay", () => {
  describe("positive", () => {
    it("describes the fortnight in words for anyone who cannot see the line", () => {
      render(<EntriesPerDay values={[1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 22]} nowS={NOW} />);
      expect(screen.getByRole("img")).toHaveAccessibleName(
        "Entries per day over the last 14 days, 32 in total, 22 on the busiest day",
      );
    });

    it("shows the day under the pointer", () => {
      render(<EntriesPerDay values={[1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 22]} nowS={NOW} />);
      fireEvent.mouseEnter(screen.getAllByTestId("day-hit").at(-1)!);
      expect(screen.getByText("22 entries")).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("says there were no entries instead of drawing a line at zero", () => {
      const { container } = render(<EntriesPerDay values={Array(14).fill(0)} nowS={NOW} />);
      expect(screen.getByText("No entries in the last 14 days")).toBeInTheDocument();
      expect(container.querySelector("svg path")).toBeNull();
    });
  });

  describe("edge", () => {
    it("writes one entry in the singular", () => {
      render(<EntriesPerDay values={[...Array(13).fill(0), 1]} nowS={NOW} />);
      fireEvent.mouseEnter(screen.getAllByTestId("day-hit").at(-1)!);
      expect(screen.getByText("1 entry")).toBeInTheDocument();
    });
  });
});

describe("DistanceRings", () => {
  describe("positive", () => {
    it("keys the distances longest first, marking the full one and printing no counts", () => {
      render(
        <DistanceRings
          categories={[
            category("5K", 5_000, 200, 200),
            category("21K", 21_000, 100, 14),
            category("10K", 10_000, 200, 98),
          ]}
        />,
      );
      const rows = screen.getAllByRole("listitem");
      // The counts are on the Entries tab. Here a long code next to a count
      // pushed the count out of the card.
      expect(rows.map((row) => row.textContent)).toEqual(["21K", "10K", "5KFull"]);
      expect(screen.getByRole("img")).toHaveAccessibleName(
        "21K 14 percent, 10K 49 percent, 5K full",
      );
    });
  });

  describe("negative", () => {
    it("draws no arc for a distance nobody has entered", () => {
      const { container } = render(<DistanceRings categories={[category("10K", 10_000, 200, 0)]} />);
      expect(container.querySelectorAll('path[data-part="fill"]')).toHaveLength(0);
      expect(container.querySelectorAll('path[data-part="track"]')).toHaveLength(1);
    });
  });

  describe("edge", () => {
    it("says so when the race has no distances", () => {
      render(<DistanceRings categories={[]} />);
      expect(screen.getByText("No distances")).toBeInTheDocument();
    });

    it("never divides by a quota of zero", () => {
      const { container } = render(<DistanceRings categories={[category("10K", 10_000, 0, 0)]} />);
      expect(container.innerHTML).not.toContain("NaN");
    });
  });
});
