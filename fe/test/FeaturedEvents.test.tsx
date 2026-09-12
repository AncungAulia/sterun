import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FeaturedEvents } from "@/modules/directory/component/FeaturedEvents";

import { category, entry, metadata, summary } from "./fixtures/directory";

function race(eventId: number) {
  return entry(summary(eventId, {}, [category(0)]), metadata());
}

/** FeaturedCard's root is the link, so the grid placement classes sit on it. */
function card(region: HTMLElement, name: string) {
  return within(region).getByRole("link", { name });
}

describe("FeaturedEvents", () => {
  it("renders nothing without races to feature", () => {
    const { container } = render(<FeaturedEvents entries={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("gives the first race the large card and the next two the side", () => {
    render(<FeaturedEvents entries={[race(0), race(1), race(2)]} />);

    const region = screen.getByRole("region", { name: "Featured races" });
    expect(region).toHaveClass("lg:grid-cols-3", "lg:grid-rows-2");
    expect(within(region).getAllByRole("link")).toHaveLength(3);
    expect(within(region).getByRole("heading", { name: "Jakarta Marathon 0" })).toHaveClass("heading-hero");
    expect(within(region).getByRole("heading", { name: "Jakarta Marathon 1" })).not.toHaveClass("heading-hero");
    expect(card(region, "Jakarta Marathon 0")).toHaveClass("lg:col-span-2", "lg:row-span-2");
  });

  it("gives each of two side cards one row, filled to its height", () => {
    render(<FeaturedEvents entries={[race(0), race(1), race(2)]} />);

    const region = screen.getByRole("region", { name: "Featured races" });
    for (const name of ["Jakarta Marathon 1", "Jakarta Marathon 2"]) {
      expect(card(region, name)).not.toHaveClass("lg:row-span-2");
      expect(card(region, name)).toHaveClass("lg:aspect-auto", "lg:h-full");
    }
  });

  it("puts two races side by side in equal columns rather than one towering over the other", () => {
    render(<FeaturedEvents entries={[race(0), race(1)]} />);

    const region = screen.getByRole("region", { name: "Featured races" });
    expect(within(region).getAllByRole("link")).toHaveLength(2);
    expect(region).toHaveClass("lg:grid-cols-2");
    expect(region).not.toHaveClass("lg:grid-cols-3");
    expect(region).not.toHaveClass("lg:grid-rows-2");
    // Both keep the card's own 16:9 shape, and neither spans anything.
    for (const name of ["Jakarta Marathon 0", "Jakarta Marathon 1"]) {
      const both = card(region, name);
      expect(both).toHaveClass("sm:aspect-video");
      expect(both).not.toHaveClass("lg:col-span-2");
      expect(both).not.toHaveClass("lg:row-span-2");
      expect(both).not.toHaveClass("lg:aspect-auto");
    }
  });

  it("still leads with the larger card's contents when there are only two races", () => {
    render(<FeaturedEvents entries={[race(0), race(1)]} />);

    const region = screen.getByRole("region", { name: "Featured races" });
    expect(within(region).getByRole("heading", { name: "Jakarta Marathon 0" })).toHaveClass("heading-hero");
    expect(within(region).getByRole("heading", { name: "Jakarta Marathon 1" })).not.toHaveClass("heading-hero");
    // The venue and the price are the lead card's alone, whatever the count.
    expect(within(region).getAllByText("FT UGM, Sleman")).toHaveLength(1);
    expect(within(region).getAllByText("From sUSD 25")).toHaveLength(1);
  });

  it("lets a single race take the whole row", () => {
    render(<FeaturedEvents entries={[race(0)]} />);

    const region = screen.getByRole("region", { name: "Featured races" });
    expect(within(region).getAllByRole("link")).toHaveLength(1);
    expect(region).not.toHaveClass("lg:grid-cols-3");
    expect(region).not.toHaveClass("lg:grid-cols-2");
    const lead = card(region, "Jakarta Marathon 0");
    expect(lead).not.toHaveClass("lg:col-span-2");
    // A full-width 16:9 card would be taller than most laptop screens.
    expect(lead).toHaveClass("lg:aspect-[21/9]");
  });

  it("puts no more than two races beside the large one", () => {
    render(<FeaturedEvents entries={[race(0), race(1), race(2), race(3)]} />);

    const region = screen.getByRole("region", { name: "Featured races" });
    expect(within(region).getAllByRole("link")).toHaveLength(3);
    expect(within(region).queryByRole("heading", { name: "Jakarta Marathon 3" })).not.toBeInTheDocument();
  });
});
