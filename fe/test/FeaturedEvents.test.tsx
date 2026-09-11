import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FeaturedEvents } from "@/modules/directory/component/FeaturedEvents";

import { category, entry, metadata, summary } from "./fixtures/directory";

function race(eventId: number) {
  return entry(summary(eventId, {}, [category(0)]), metadata());
}

describe("FeaturedEvents", () => {
  it("renders nothing without races to feature", () => {
    const { container } = render(<FeaturedEvents entries={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("gives the first race the large card and the next two the side", () => {
    render(<FeaturedEvents entries={[race(0), race(1), race(2)]} />);

    const region = screen.getByRole("region", { name: "Featured races" });
    expect(region).toHaveClass("lg:grid-cols-3");
    expect(within(region).getAllByRole("link")).toHaveLength(3);
    expect(within(region).getByRole("heading", { name: "Jakarta Marathon 0" })).toHaveClass("heading-hero");
    expect(within(region).getByRole("heading", { name: "Jakarta Marathon 1" })).not.toHaveClass("heading-hero");
  });

  it("lets a single race take the whole row", () => {
    render(<FeaturedEvents entries={[race(0)]} />);

    const region = screen.getByRole("region", { name: "Featured races" });
    expect(within(region).getAllByRole("link")).toHaveLength(1);
    expect(region).not.toHaveClass("lg:grid-cols-3");
    // EventCard's root is the link, so its parent is the wrapper that spans columns.
    const leadWrapper = within(region).getByRole("link").parentElement;
    expect(leadWrapper).not.toHaveClass("lg:col-span-2");
  });

  it("puts no more than two races beside the large one", () => {
    render(<FeaturedEvents entries={[race(0), race(1), race(2), race(3)]} />);

    const region = screen.getByRole("region", { name: "Featured races" });
    expect(within(region).getAllByRole("link")).toHaveLength(3);
    expect(within(region).queryByRole("heading", { name: "Jakarta Marathon 3" })).not.toBeInTheDocument();
  });
});
