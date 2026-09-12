import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EventCard } from "@/modules/directory/component/EventCard";
import { formatEventDate } from "@/utils/format";

import { SUSD, category, entry, metadata, summary } from "./fixtures/directory";

describe("EventCard", () => {
  describe("positive", () => {
    it("links the whole card to the race", () => {
      render(<EventCard entry={entry(summary(7, {}, [category(0)]), metadata())} documentLoading={false} />);

      expect(screen.getByRole("link", { name: /Jakarta Marathon 7/ })).toHaveAttribute("href", "/events/7");
    });

    it("shows the venue, date, entries left, starting price and status", () => {
      const race = summary(7, {}, [
        category(0, { quota: 600, enteredCount: 100, priceStroops: 25n * SUSD }),
        category(1, { quota: 10, enteredCount: 10, priceStroops: 40n * SUSD }),
      ]);

      render(<EventCard entry={entry(race, metadata())} documentLoading={false} />);

      expect(screen.getByText("FT UGM, Sleman")).toBeInTheDocument();
      expect(screen.getByText(formatEventDate(race.event.startsAt))).toBeInTheDocument();
      expect(screen.getByText("500 entries left")).toBeInTheDocument();
      expect(screen.getByText("From sUSD 25")).toBeInTheDocument();
      expect(screen.getByText("Open")).toBeInTheDocument();
    });

    it("puts the poster in the frame", () => {
      const { container } = render(
        <EventCard entry={entry(summary(7, {}, [category(0)]), metadata())} documentLoading={false} />,
      );

      expect(container.querySelector("img")?.getAttribute("src")).toBe("https://files.test/poster.jpg");
    });

    it("sets the title in the card face, two lines at most", () => {
      render(<EventCard entry={entry(summary(7, {}, [category(0)]), metadata())} documentLoading={false} />);

      const heading = screen.getByRole("heading", { name: "Jakarta Marathon 7" });
      expect(heading).toHaveClass("heading-strong", "line-clamp-2");
      expect(heading).not.toHaveClass("heading-hero");
    });

    it("names the link by the race alone, even with No image in the card", () => {
      render(<EventCard entry={entry(summary(7, {}, [category(0)]), null)} documentLoading={false} />);

      expect(screen.getByText("No image")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Jakarta Marathon 7" })).toHaveAttribute("href", "/events/7");
    });

    it("describes the link by its details, so Tab announces when the race is", () => {
      const race = summary(7, {}, [category(0)]);

      render(<EventCard entry={entry(race, metadata())} documentLoading={false} />);

      const link = screen.getByRole("link", { name: "Jakarta Marathon 7" });
      expect(link).toHaveAccessibleDescription(expect.stringContaining(formatEventDate(race.event.startsAt)));
      expect(link).toHaveAccessibleDescription(expect.stringContaining("FT UGM, Sleman"));
    });

    it("keeps a grid card's body filling the card, so prices line up across a row", () => {
      render(<EventCard entry={entry(summary(7, {}, [category(0)]), metadata())} documentLoading={false} />);

      const heading = screen.getByRole("heading", { name: "Jakarta Marathon 7" });
      const body = heading.parentElement;
      const frame = body?.previousElementSibling;
      expect(frame?.querySelector("img")).not.toBeNull();
      expect(frame).toHaveClass("aspect-video");
      expect(frame).not.toHaveClass("lg:grow");
      expect(body).toHaveClass("flex-1");
    });
  });

  describe("edge", () => {
    it("leaves the venue out and says No image when the document is not proven", () => {
      render(<EventCard entry={entry(summary(7, {}, [category(0)]), null)} documentLoading={false} />);

      expect(screen.queryByText("FT UGM, Sleman")).not.toBeInTheDocument();
      expect(screen.getByText("No image")).toBeInTheDocument();
    });

    it("says No distances yet for a race without categories", () => {
      render(<EventCard entry={entry(summary(7), metadata())} documentLoading={false} />);

      expect(screen.getByText("No distances yet")).toBeInTheDocument();
    });

    it("does not say No image while the document is loading", () => {
      render(<EventCard entry={entry(summary(7, {}, [category(0)]), null)} documentLoading />);

      expect(screen.queryByText("No image")).not.toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("does not count entries for a race that is not open", () => {
      render(
        <EventCard entry={entry(summary(7, { status: "Closed" }, [category(0)]), metadata())} documentLoading={false} />,
      );

      expect(screen.queryByText(/entries left/)).not.toBeInTheDocument();
      expect(screen.getByText("Closed")).toBeInTheDocument();
    });
  });
});
