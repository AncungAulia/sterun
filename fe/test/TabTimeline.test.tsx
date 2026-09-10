/**
 * The dates, read down a rail instead of across a scrollbar.
 *
 * Sideways scrolling hid the last date behind an edge, which on this page is
 * race day itself. Down the page nothing hides, and the order the moments
 * happen in is the order they are read in.
 *
 * `now` is injected rather than read from the clock so these stay true in
 * 2027. Everywhere else it defaults to the real one.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TabTimeline } from "@/modules/event-detail/component/TabTimeline";
import type { EventMetadata } from "@/lib/metadata";

/** 2026-11-21T05:00+07:00, the same gun start the other event tests use. */
const RACE_DAY = 1_795_824_000n;

const DOCUMENT: EventMetadata = {
  schedule: [
    { phase: "registration", startsAt: "2026-09-01T09:00:00+07:00", endsAt: "2026-11-09T06:00:00+07:00" },
    { phase: "racepack", startsAt: "2026-11-18T09:00:00+07:00", endsAt: "2026-11-20T21:00:00+07:00" },
  ],
};

function at(iso: string) {
  return Date.parse(iso);
}

describe("TabTimeline", () => {
  describe("positive", () => {
    it("lists every moment in the order it happens, race day last", () => {
      render(<TabTimeline document={DOCUMENT} startsAt={RACE_DAY} now={at("2026-09-10T00:00:00Z")} />);

      const labels = screen
        .getAllByRole("listitem")
        .map((item) => within(item).getByTestId("moment-label").textContent);

      expect(labels).toEqual([
        "Registration opens",
        "Registration closes",
        "Race pack collection opens",
        "Race pack collection closes",
        "Race day",
      ]);
    });

    it("marks the moments that have already happened", () => {
      // Registration opened in September; everything else is still ahead.
      render(<TabTimeline document={DOCUMENT} startsAt={RACE_DAY} now={at("2026-09-10T00:00:00Z")} />);

      const items = screen.getAllByRole("listitem");
      expect(items[0]).toHaveAttribute("data-passed", "true");
      expect(items[1]).toHaveAttribute("data-passed", "false");
      expect(items[4]).toHaveAttribute("data-passed", "false");
    });

    it("marks race day as passed once the race has been run", () => {
      render(<TabTimeline document={DOCUMENT} startsAt={RACE_DAY} now={at("2026-12-01T00:00:00Z")} />);

      for (const item of screen.getAllByRole("listitem")) {
        expect(item).toHaveAttribute("data-passed", "true");
      }
    });

    it("says in words which moments have gone, not only in colour", () => {
      // Nobody reads a dot. The state has to survive a screen reader and a
      // reader who cannot tell teal from grey.
      render(<TabTimeline document={DOCUMENT} startsAt={RACE_DAY} now={at("2026-09-10T00:00:00Z")} />);

      const items = screen.getAllByRole("listitem");
      expect(within(items[0]).getByText(/passed/i)).toBeInTheDocument();
      expect(within(items[1]).queryByText(/passed/i)).not.toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("never scrolls sideways, which is what hid race day", () => {
      const { container } = render(
        <TabTimeline document={DOCUMENT} startsAt={RACE_DAY} now={at("2026-09-10T00:00:00Z")} />,
      );

      const scrollers = container.querySelectorAll("[class*='overflow-x']");
      expect(scrollers).toHaveLength(0);
    });

    it("still shows race day when the document carries no schedule at all", () => {
      render(<TabTimeline document={{}} startsAt={RACE_DAY} now={at("2026-09-10T00:00:00Z")} />);

      expect(screen.getAllByRole("listitem")).toHaveLength(1);
      expect(screen.getByTestId("moment-label")).toHaveTextContent("Race day");
    });
  });
});
