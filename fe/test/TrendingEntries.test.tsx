import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TrendingEntries } from "@/modules/organiser/component/TrendingEntries";
import type { TrendingRow } from "@/lib/records";

function row(overrides: Partial<TrendingRow> = {}): TrendingRow {
  return { eventId: 1, eventName: "Fun Run Sleman", code: "5K", count: 42, ...overrides };
}

describe("TrendingEntries", () => {
  describe("positive", () => {
    it("names the distance, the race it belongs to, and how many joined", () => {
      render(<TrendingEntries rows={[row()]} days={7} />);

      expect(screen.getByText("5K")).toBeInTheDocument();
      expect(screen.getByText("Fun Run Sleman")).toBeInTheDocument();
      expect(screen.getByText("+42")).toBeInTheDocument();
    });

    it("keeps the order it was given and numbers it", () => {
      // The ranking is `trending`'s, which has its own tests. What is asserted
      // here is only that the panel does not quietly reorder it.
      render(
        <TrendingEntries
          rows={[row(), row({ eventId: 2, code: "10K", count: 31 })]}
          days={7}
        />,
      );

      const items = screen.getAllByRole("listitem");
      expect(within(items[0]).getByText("#1")).toBeInTheDocument();
      expect(within(items[0]).getByText("5K")).toBeInTheDocument();
      expect(within(items[1]).getByText("#2")).toBeInTheDocument();
      expect(within(items[1]).getByText("10K")).toBeInTheDocument();
    });

    it("says how long a window it is reporting on", () => {
      render(<TrendingEntries rows={[row()]} days={7} />);

      expect(screen.getByText("Last 7 days")).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("says nothing moved rather than drawing an empty list", () => {
      // "Nothing in the last week" is a real answer. An empty box reads as a
      // panel that failed to load.
      render(<TrendingEntries rows={[]} days={7} />);

      expect(screen.getByText("No entries in the last 7 days.")).toBeInTheDocument();
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("tells two distances of the same name in different races apart", () => {
      // Two 5Ks stacked with no race name under them is a ranking nobody can
      // act on: the decision is about one race's wave.
      render(
        <TrendingEntries
          rows={[row(), row({ eventId: 2, eventName: "TechSprint UGM 2026", count: 18 })]}
          days={7}
        />,
      );

      const items = screen.getAllByRole("listitem");
      expect(within(items[0]).getByText("Fun Run Sleman")).toBeInTheDocument();
      expect(within(items[1]).getByText("TechSprint UGM 2026")).toBeInTheDocument();
    });
  });
});
