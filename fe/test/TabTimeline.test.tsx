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
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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

  describe("what each moment says and offers", () => {
    const RICH: EventMetadata = {
      schedule: [
        { phase: "registration", startsAt: "2026-09-01T09:00:00+07:00", endsAt: "2026-11-09T06:00:00+07:00" },
        {
          phase: "racepack",
          startsAt: "2026-11-18T09:00:00+07:00",
          endsAt: "2026-11-20T21:00:00+07:00",
          venue: "GOR UGM, Hall A",
          venueLat: -7.77,
          venueLng: 110.37,
          dailyOpens: "09:00",
          dailyCloses: "21:00",
        },
      ],
      categories: [
        { code: "5K", startTime: "2026-11-20T22:15:00Z" },
        { code: "10K", startTime: "2026-11-20T22:00:00Z" },
      ],
      location: { name: "Lapangan GSP", lat: -7.771, lng: 110.377 },
    };
    const BEFORE_ANYTHING = at("2026-08-01T00:00:00Z");

    function item(label: string) {
      return screen
        .getAllByRole("listitem")
        .find((entry) => within(entry).getByTestId("moment-label").textContent === label)!;
    }

    it("names the distances where entries open, and offers to enter while the chain allows it", async () => {
      const onEnter = vi.fn();
      render(
        <TabTimeline
          document={RICH}
          startsAt={RACE_DAY}
          categoryCodes={["5K", "10K"]}
          canEnter
          onEnter={onEnter}
          now={BEFORE_ANYTHING}
        />,
      );

      const opens = item("Registration opens");
      expect(within(opens).getByText("Entries open for 5K, 10K.")).toBeInTheDocument();
      await userEvent.setup().click(within(opens).getByRole("button", { name: "Enter race" }));
      expect(onEnter).toHaveBeenCalledOnce();
    });

    it("puts the collection desk's venue, hours and map on the moment it opens", () => {
      render(<TabTimeline document={RICH} startsAt={RACE_DAY} now={BEFORE_ANYTHING} />);

      const opens = item("Race pack collection opens");
      expect(within(opens).getByText("GOR UGM, Hall A")).toBeInTheDocument();
      expect(within(opens).getByText("Open 09:00 to 21:00 each day.")).toBeInTheDocument();
      expect(within(opens).getByRole("link", { name: /open in maps/i })).toHaveAttribute(
        "href",
        "https://www.google.com/maps?q=-7.77,110.37",
      );
    });

    it("says when each distance goes off on race day, and where", () => {
      render(<TabTimeline document={RICH} startsAt={RACE_DAY} now={BEFORE_ANYTHING} />);

      const race = item("Race day");
      // 22:15Z is 05:15 in Jakarta, and the test runner's zone is not Jakarta's,
      // so the clock is matched by shape and the codes by name.
      expect(within(race).getByText(/^5K starts \d{2}:\d{2} · 10K starts \d{2}:\d{2}$/)).toBeInTheDocument();
      expect(within(race).getByText("Lapangan GSP")).toBeInTheDocument();
      expect(within(race).getByRole("link", { name: /open in maps/i })).toBeInTheDocument();
    });

    it("warns that a distance can close before the registration date does", () => {
      render(<TabTimeline document={RICH} startsAt={RACE_DAY} now={BEFORE_ANYTHING} />);

      expect(
        within(item("Registration closes")).getByText(/sooner if a distance sells out/i),
      ).toBeInTheDocument();
    });

    it("offers no entry while the chain would refuse one", () => {
      // Past the opening date but still Draft, or every distance full: the
      // dates say go, the contract says no, and the contract is right.
      render(
        <TabTimeline
          document={RICH}
          startsAt={RACE_DAY}
          categoryCodes={["5K"]}
          canEnter={false}
          onEnter={vi.fn()}
          now={BEFORE_ANYTHING}
        />,
      );

      expect(screen.queryByRole("button", { name: "Enter race" })).not.toBeInTheDocument();
    });

    it("offers nothing to press on a moment that has already gone", () => {
      render(
        <TabTimeline
          document={RICH}
          startsAt={RACE_DAY}
          canEnter
          onEnter={vi.fn()}
          now={at("2026-12-01T00:00:00Z")}
        />,
      );

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("draws no map link for a venue with no pin", () => {
      // A short maps.app.goo.gl link carries no coordinates, so the document
      // names the venue and has nowhere to point.
      render(
        <TabTimeline
          document={{
            schedule: [
              {
                phase: "racepack",
                startsAt: "2026-11-18T09:00:00+07:00",
                endsAt: "2026-11-20T21:00:00+07:00",
                venue: "GOR UGM, Hall A",
              },
            ],
          }}
          startsAt={RACE_DAY}
          now={BEFORE_ANYTHING}
        />,
      );

      expect(within(item("Race pack collection opens")).getByText("GOR UGM, Hall A")).toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
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
