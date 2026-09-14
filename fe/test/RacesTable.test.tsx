import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RacesTable, type RaceRow } from "@/modules/organiser/component/RacesTable";

function row(overrides: Partial<RaceRow> = {}): RaceRow {
  return {
    eventId: 1,
    name: "Fun Run Sleman",
    startsAt: 1_800_259_200n,
    status: "Open",
    entered: 88,
    quota: 300,
    entriesPerDay: [1, 2, 3],
    ...overrides,
  };
}

describe("RacesTable", () => {
  describe("positive", () => {
    it("names each race and how full it is", () => {
      render(<RacesTable rows={[row()]} nowS={1_800_000_000n} />);

      expect(screen.getByText("Fun Run Sleman")).toBeInTheDocument();
      expect(screen.getByText("88 / 300")).toBeInTheDocument();
    });

    it("gives every race two ways into its own page, both named after it", () => {
      // The name and the icon at the end of the row. The icon's accessible name
      // is the race's rather than the word "Open": four rows would otherwise be
      // four identical links, and a screen reader would announce the same thing
      // four times without saying which race any of them opened.
      render(<RacesTable rows={[row()]} nowS={1_800_000_000n} />);

      const [byName, byIcon] = screen.getAllByRole("link", { name: /Fun Run Sleman/ });
      expect(byName).toHaveAttribute("href", "/org/events/1");
      expect(byIcon).toHaveAttribute("href", "/org/events/1");
      expect(screen.queryByRole("link", { name: "Open" })).not.toBeInTheDocument();
    });

    it("says how long there is until race day", () => {
      render(<RacesTable rows={[row()]} nowS={1_800_000_000n} />);

      expect(screen.getByText(/in 3 days/)).toBeInTheDocument();
    });

    it("draws a line for a race that has entries", () => {
      const { container } = render(<RacesTable rows={[row()]} nowS={1_800_000_000n} />);

      // Scoped by role, because the row's action is an icon and an icon is an
      // <svg> full of paths: a bare `svg path` query would be answered by the
      // wrong element and pass whatever the sparkline did.
      const spark = container.querySelector('svg[role="img"]');
      expect(spark?.querySelector("path")).not.toBeNull();
      expect(spark?.querySelector("line")).toBeNull();
    });
  });

  describe("negative", () => {
    it("says a race has already run rather than counting down past zero", () => {
      render(<RacesTable rows={[row({ startsAt: 1_799_000_000n })]} nowS={1_800_000_000n} />);

      expect(screen.getByText(/days ago/)).toBeInTheDocument();
    });

    it("renders an empty state rather than a bare table head", () => {
      render(<RacesTable rows={[]} nowS={1_800_000_000n} />);

      expect(screen.getByText("You have not published a race yet.")).toBeInTheDocument();
    });

    it("draws a plain rule, not a flat line, for a race nobody has entered", () => {
      // A line along the bottom reads as a measurement. This is an absence, and
      // the two must not look the same.
      const { container } = render(
        <RacesTable
          rows={[row({ entered: 0, entriesPerDay: [0, 0, 0] })]}
          nowS={1_800_000_000n}
        />,
      );

      const spark = container.querySelector('svg[role="img"]');
      expect(spark?.querySelector("line")).not.toBeNull();
      expect(spark?.querySelector("path")).toBeNull();
    });
  });

  describe("edge", () => {
    it("never prints the word Draft", () => {
      const { container } = render(
        <RacesTable rows={[row({ status: "Draft" })]} nowS={1_800_000_000n} />,
      );

      expect(container.textContent).not.toMatch(/draft/i);
      expect(screen.getByText("Not open yet")).toBeInTheDocument();
    });

    it("survives a quota of zero without dividing by it", () => {
      // The contract refuses a zero quota, but a partly-read event can still
      // reach this table with no categories at all.
      render(<RacesTable rows={[row({ entered: 0, quota: 0 })]} nowS={1_800_000_000n} />);

      expect(screen.getByText("0 / 0")).toBeInTheDocument();
      const track = document.querySelector("[data-fill]");
      expect(track).toHaveAttribute("data-fill", "0%");
    });

    it("says today rather than in 0 days on race day itself", () => {
      render(<RacesTable rows={[row({ startsAt: 1_800_000_000n })]} nowS={1_800_000_000n} />);

      expect(screen.getByText(/today/)).toBeInTheDocument();
    });
  });
});

/**
 * At phone width the races are a list you tap, not a table (Ancung,
 * 2026-09-15). jsdom has no layout, so these force the one number
 * `useIsMobile` reads, `window.innerWidth`, and ask only what is in the
 * document.
 */
describe("RacesTable at phone width", () => {
  const WIDE = window.innerWidth;
  function setWidth(px: number) {
    Object.defineProperty(window, "innerWidth", { value: px, configurable: true });
  }
  afterEach(() => setWidth(WIDE));

  describe("positive", () => {
    it("lists each race as one link carrying its name, status, date and fill", () => {
      setWidth(390);
      render(<RacesTable rows={[row(), row({ eventId: 2, name: "Lari Teknik" })]} nowS={1_800_000_000n} />);

      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      const items = screen.getAllByRole("listitem");
      expect(items).toHaveLength(2);

      const link = within(items[0]).getByRole("link");
      expect(link).toHaveAttribute("href", "/org/events/1");
      expect(link).toHaveTextContent("Fun Run Sleman");
      expect(link).toHaveTextContent("Open for entry");
      expect(link).toHaveTextContent(/in 3 days/);
      expect(link).toHaveTextContent("88 / 300");
    });
  });

  describe("negative", () => {
    it("gives a race one way in on a phone, not two", () => {
      // The table's second link is an icon in the last column. In a row you
      // tap, the whole row is the link and a second one would be a smaller
      // target for the same place.
      setWidth(390);
      render(<RacesTable rows={[row()]} nowS={1_800_000_000n} />);

      expect(screen.getAllByRole("link")).toHaveLength(1);
    });
  });

  describe("edge", () => {
    it("keeps the table on a wide screen", () => {
      setWidth(1280);
      render(<RacesTable rows={[row()]} nowS={1_800_000_000n} />);

      expect(screen.getByRole("table")).toBeInTheDocument();
      expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    });

    it("still says there are no races on a phone", () => {
      setWidth(390);
      render(<RacesTable rows={[]} nowS={1_800_000_000n} />);

      expect(screen.getByText("You have not published a race yet.")).toBeInTheDocument();
    });
  });
});
