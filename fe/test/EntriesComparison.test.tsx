import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  EntriesComparison,
  type ComparisonSeries,
} from "@/modules/organiser/component/EntriesComparison";

function series(overrides: Partial<ComparisonSeries> = {}): ComparisonSeries {
  return {
    name: "Fun Run Sleman",
    finished: false,
    points: [
      { daysOut: 45, filled: 0.1 },
      { daysOut: 20, filled: 0.2 },
      { daysOut: 3, filled: 0.29 },
    ],
    ...overrides,
  };
}

describe("EntriesComparison", () => {
  describe("positive", () => {
    it("is titled Entries comparison, never Pace", () => {
      // In a running product "pace" means minutes per kilometre. A runner
      // reading it here would think the chart was about how fast people run.
      const { container } = render(<EntriesComparison series={[series()]} />);

      expect(screen.getByText("Entries comparison")).toBeInTheDocument();
      expect(container.textContent).not.toMatch(/pace/i);
    });

    it("names both axes, because nothing else on the page explains them", () => {
      render(<EntriesComparison series={[series()]} />);

      expect(screen.getByText("days to race day")).toBeInTheDocument();
      expect(screen.getByText("Percent of quota")).toBeInTheDocument();
      expect(screen.getByText("100%")).toBeInTheDocument();
    });

    it("puts each race in the key with how full it ended up", () => {
      render(
        <EntriesComparison
          series={[series(), series({ name: "Jogja Night Run", finished: true })]}
        />,
      );

      expect(screen.getByText("Jogja Night Run")).toBeInTheDocument();
      expect(screen.getAllByText("29%")).toHaveLength(2);
    });

    it("draws one line per race", () => {
      const { container } = render(
        <EntriesComparison
          series={[series(), series({ name: "Jogja Night Run", finished: true })]}
        />,
      );

      expect(container.querySelectorAll("svg > path")).toHaveLength(2);
    });
  });

  describe("negative", () => {
    it("draws no chart at all when no race has entries", () => {
      // Axes over an empty plot are a chart claiming to have measured
      // something. There is nothing to measure, so there is no chart.
      const { container } = render(<EntriesComparison series={[]} />);

      expect(screen.getByText("No entries to compare yet.")).toBeInTheDocument();
      expect(container.querySelector("svg")).toBeNull();
    });

    it("leaves out a race whose series is empty rather than drawing a flat line", () => {
      const { container } = render(
        <EntriesComparison series={[series(), series({ name: "Borobudur Trial", points: [] })]} />,
      );

      expect(container.querySelectorAll("svg > path")).toHaveLength(1);
      expect(screen.queryByText("Borobudur Trial")).not.toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("marks only a race still to run with where it has got to", () => {
      // A finished race has no "now" to mark, and a dot on it would read as a
      // race that had stopped selling.
      const { container } = render(
        <EntriesComparison
          series={[series(), series({ name: "Jogja Night Run", finished: true })]}
        />,
      );

      expect(container.querySelectorAll("circle")).toHaveLength(1);
    });

    it("draws a finished race dashed and a live one solid", () => {
      const { container } = render(
        <EntriesComparison
          series={[series(), series({ name: "Jogja Night Run", finished: true })]}
        />,
      );

      const dashed = [...container.querySelectorAll("svg > path")].filter((path) =>
        path.hasAttribute("stroke-dasharray"),
      );
      expect(dashed).toHaveLength(1);
    });

    it("produces no NaN in any path, whatever the series", () => {
      // An SVG path holding NaN does not throw. The browser drops it and the
      // panel renders empty with nothing in the console.
      const { container } = render(
        <EntriesComparison
          series={[
            series({ points: [{ daysOut: 0, filled: 0 }] }),
            series({ name: "Long Lead", points: [{ daysOut: 400, filled: 1 }] }),
          ]}
        />,
      );

      for (const path of container.querySelectorAll("path")) {
        expect(path.getAttribute("d")).not.toContain("NaN");
      }
    });
  });
});
