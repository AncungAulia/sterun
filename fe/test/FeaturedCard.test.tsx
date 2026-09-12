import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FeaturedCard, featuredTitleClass } from "@/modules/directory/component/FeaturedCard";
import { formatEventDate } from "@/utils/format";

import { SUSD, category, entry, metadata, summary } from "./fixtures/directory";

/** 39 characters, from testnet: long enough that the title has to step down. */
const LONG_NAME = "Sterun untimed finish sanity 2026-09-11";

function race(overrides: Parameters<typeof summary>[1] = {}) {
  return summary(7, overrides, [category(0, { quota: 600, enteredCount: 100, priceStroops: 25n * SUSD })]);
}

describe("FeaturedCard", () => {
  describe("positive", () => {
    it("links the whole card to the race, named by its title alone", () => {
      render(<FeaturedCard entry={entry(race(), metadata())} size="lead" />);

      const link = screen.getByRole("link", { name: "Jakarta Marathon 7" });
      expect(link).toHaveAttribute("href", "/events/7");
      expect(link).toHaveAttribute("data-slot", "event-card");
    });

    it("shows the venue, date, entries left, price and status on the lead card", () => {
      const lead = race();

      render(<FeaturedCard entry={entry(lead, metadata())} size="lead" />);

      expect(screen.getByText("FT UGM, Sleman")).toBeInTheDocument();
      expect(screen.getByText(formatEventDate(lead.event.startsAt))).toBeInTheDocument();
      expect(screen.getByText("500 entries left")).toBeInTheDocument();
      expect(screen.getByText("From sUSD 25")).toBeInTheDocument();
      expect(screen.getByText("Open")).toBeInTheDocument();
    });

    it("describes the link by its details, so Tab announces where, when and how much", () => {
      const lead = race();

      render(<FeaturedCard entry={entry(lead, metadata())} size="lead" />);

      const link = screen.getByRole("link", { name: "Jakarta Marathon 7" });
      expect(link).toHaveAccessibleDescription(expect.stringContaining(formatEventDate(lead.event.startsAt)));
      expect(link).toHaveAccessibleDescription(expect.stringContaining("FT UGM, Sleman"));
      // The price is not in the details list, so it needs its own id or it is
      // the one line on the card a screen reader never reaches.
      expect(link).toHaveAccessibleDescription(expect.stringContaining("From sUSD 25"));
    });

    it("describes a side card by its details alone, since it prints no price", () => {
      const side = race();

      render(<FeaturedCard entry={entry(side, metadata())} size="side" />);

      const link = screen.getByRole("link", { name: "Jakarta Marathon 7" });
      expect(link.getAttribute("aria-describedby")?.trim().split(/\s+/)).toHaveLength(1);
      expect(link).toHaveAccessibleDescription(expect.stringContaining(formatEventDate(side.event.startsAt)));
    });

    it("sets the lead title in the hero face, two lines at most", () => {
      render(<FeaturedCard entry={entry(race(), metadata())} size="lead" />);

      const heading = screen.getByRole("heading", { name: "Jakarta Marathon 7" });
      expect(heading).toHaveClass("heading-hero", "text-4xl", "sm:text-5xl", "line-clamp-2");
    });

    it("keeps a side card to title, date and entries left, without the hero face", () => {
      const side = race();

      render(<FeaturedCard entry={entry(side, metadata())} size="side" />);

      const heading = screen.getByRole("heading", { name: "Jakarta Marathon 7" });
      expect(heading).toHaveClass("heading-strong", "text-xl", "line-clamp-2");
      expect(heading).not.toHaveClass("heading-hero");
      expect(screen.getByText(formatEventDate(side.event.startsAt))).toBeInTheDocument();
      expect(screen.getByText("500 entries left")).toBeInTheDocument();
      expect(screen.getByText("Open")).toBeInTheDocument();
      expect(screen.queryByText("FT UGM, Sleman")).not.toBeInTheDocument();
      expect(screen.queryByText("From sUSD 25")).not.toBeInTheDocument();
    });

    it("lets the poster fill the whole card instead of a 16:9 box above a body", () => {
      const { container } = render(<FeaturedCard entry={entry(race(), metadata())} size="lead" />);

      const img = container.querySelector("img");
      expect(img?.getAttribute("src")).toBe("https://files.test/poster.jpg");
      const frame = img?.parentElement;
      expect(frame).toHaveClass("absolute", "inset-0", "aspect-auto");
      expect(frame).not.toHaveClass("aspect-video");
    });

    it("sets the text in light type over a fade that ends before the top of the card", () => {
      render(<FeaturedCard entry={entry(race(), metadata())} size="lead" />);

      const overlay = screen.getByRole("heading", { name: "Jakarta Marathon 7" }).parentElement;
      // The point of the card is that the poster is the card: the fade runs out
      // to nothing inside the text block's own top padding, so the upper part
      // of the poster is never dimmed, and the text still never sits on bare
      // poster.
      expect(overlay).toHaveClass("text-paper", "bg-linear-to-t", "from-ink/95", "via-ink/85", "via-65%");
      expect(overlay).toHaveClass("to-transparent", "pt-16");
      // The old shape was a floor of 70% ink over the whole block plus a second
      // layer above it, which greyed most of the card.
      expect(overlay?.className).not.toMatch(/before:/);
      expect(overlay).not.toHaveClass("to-ink/70");
    });

    it("keeps a fade on a side card too, sized to its shorter text block", () => {
      render(<FeaturedCard entry={entry(race(), metadata())} size="side" />);

      const overlay = screen.getByRole("heading", { name: "Jakarta Marathon 7" }).parentElement;
      expect(overlay).toHaveClass("bg-linear-to-t", "from-ink/95", "to-transparent", "pt-12");
    });

    it("lets a tall text block grow the card instead of being cut off at the top", () => {
      render(<FeaturedCard entry={entry(race(), metadata())} size="lead" />);

      // `overflow-hidden` switches off the aspect ratio's grow-to-fit rule;
      // `min-h-min` puts it back. Losing it crops the title on a phone.
      expect(screen.getByRole("link")).toHaveClass("min-h-min", "overflow-hidden");
    });

    it("puts the status badge after the text, so the fade can never dim it", () => {
      render(<FeaturedCard entry={entry(race(), metadata())} size="lead" />);

      const link = screen.getByRole("link");
      const badge = screen.getByText("Open");
      const overlay = screen.getByRole("heading", { name: "Jakarta Marathon 7" }).parentElement;
      expect(link.lastElementChild).toContainElement(badge);
      // Node.DOCUMENT_POSITION_FOLLOWING: the badge comes later in the markup.
      const position = overlay?.compareDocumentPosition(badge) ?? 0;
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("is 4:3 on phones and 16:9 from sm", () => {
      render(<FeaturedCard entry={entry(race(), metadata())} size="lead" />);

      expect(screen.getByRole("link")).toHaveClass("aspect-[4/3]", "sm:aspect-video");
    });

    it("gives a side card the same shape, leaving the rest to the row", () => {
      render(<FeaturedCard entry={entry(race(), metadata())} size="side" />);

      const link = screen.getByRole("link");
      expect(link).toHaveClass("aspect-[4/3]", "sm:aspect-video");
      // How many races the row holds decides what happens at lg, so the card
      // cannot decide it on its own.
      expect(link).not.toHaveClass("lg:aspect-auto");
      expect(link).not.toHaveClass("lg:h-full");
    });

    it("takes layout classes from the row it sits in", () => {
      render(<FeaturedCard entry={entry(race(), metadata())} size="side" className="lg:aspect-auto lg:h-full" />);

      expect(screen.getByRole("link")).toHaveClass("lg:aspect-auto", "lg:h-full");
    });
  });

  describe("title size", () => {
    it("keeps a name that fits two lines at the full size", () => {
      // 27 characters, a real testnet race: it must not shrink.
      expect(featuredTitleClass("Elektro Dash 2026 (TESTING)", "lead")).toBe("heading-hero text-4xl sm:text-5xl");
      expect(featuredTitleClass("Elektro Dash 2026 (TESTING)", "side")).toBe("heading-strong text-xl");
    });

    it("steps a long name down one size", () => {
      // 39 characters, also a real one: at the full size it runs past two lines.
      expect(featuredTitleClass(LONG_NAME, "lead")).toBe("heading-hero text-4xl");
      expect(featuredTitleClass(LONG_NAME, "side")).toBe("heading-strong text-lg");
    });

    it("never takes a lead title below text-4xl, the smallest size the hero face allows", () => {
      expect(featuredTitleClass("x".repeat(400), "lead")).toBe("heading-hero text-4xl");
      expect(featuredTitleClass("x".repeat(400), "lead", true)).toBe("heading-hero text-4xl");
    });

    it("drops a half-width lead back to text-4xl from lg, where it is no wider than its neighbour", () => {
      // Still the big face below lg: there the lead is full width in every row.
      expect(featuredTitleClass("Elektro Dash 2026 (TESTING)", "lead", true)).toBe(
        "heading-hero text-4xl sm:text-5xl lg:text-4xl",
      );
      // A name that already stepped down has nowhere further to go.
      expect(featuredTitleClass(LONG_NAME, "lead", true)).toBe("heading-hero text-4xl");
    });

    it("leaves a side title alone, since a side card is the same width whatever the row holds", () => {
      expect(featuredTitleClass("Elektro Dash 2026 (TESTING)", "side", true)).toBe("heading-strong text-xl");
    });

    it("renders the compact lead one step smaller from lg", () => {
      render(<FeaturedCard entry={entry(race(), metadata())} size="lead" compact />);

      const heading = screen.getByRole("heading", { name: "Jakarta Marathon 7" });
      expect(heading).toHaveClass("heading-hero", "sm:text-5xl", "lg:text-4xl");
    });

    it("ignores space around a name, so a padded one is not shrunk for nothing", () => {
      expect(featuredTitleClass(`   ${"x".repeat(30)}   `, "lead")).toBe("heading-hero text-4xl sm:text-5xl");
    });

    it("renders a long name one step smaller, still clamped to two lines", () => {
      render(<FeaturedCard entry={entry(race({ name: LONG_NAME }), metadata())} size="lead" />);

      const heading = screen.getByRole("heading", { name: LONG_NAME });
      expect(heading).toHaveClass("heading-hero", "text-4xl", "line-clamp-2");
      expect(heading).not.toHaveClass("sm:text-5xl");
    });

    it("renders a long name on a side card one step smaller too", () => {
      render(<FeaturedCard entry={entry(race({ name: LONG_NAME }), metadata())} size="side" />);

      const heading = screen.getByRole("heading", { name: LONG_NAME });
      expect(heading).toHaveClass("heading-strong", "text-lg", "line-clamp-2");
      expect(heading).not.toHaveClass("text-xl");
    });
  });

  describe("edge", () => {
    it("says Sold out when every place is taken", () => {
      const full = summary(7, {}, [category(0, { quota: 10, enteredCount: 10 })]);

      render(<FeaturedCard entry={entry(full, metadata())} size="side" />);

      expect(screen.getByText("Sold out")).toBeInTheDocument();
    });

    it("leaves the venue out when the document names no place", () => {
      render(<FeaturedCard entry={entry(race(), { posterUrl: "https://files.test/poster.jpg" })} size="lead" />);

      expect(screen.queryByText("FT UGM, Sleman")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Jakarta Marathon 7" })).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("does not count entries for a race that is not open", () => {
      render(<FeaturedCard entry={entry(race({ status: "Closed" }), metadata())} size="lead" />);

      expect(screen.queryByText(/entries left/)).not.toBeInTheDocument();
      expect(screen.getByText("Closed")).toBeInTheDocument();
    });
  });
});
