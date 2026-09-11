import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { FilterDrawer } from "@/modules/directory/component/FilterDrawer";
import { NO_FILTERS } from "@/modules/directory/filters";

import { SUSD, category, entry, metadata, summary } from "./fixtures/directory";

const FREE = entry(summary(0, { name: "Free Fun Run" }, [category(0, { priceStroops: 0n })]), metadata());
const PAID = entry(summary(1, { name: "Paid Road Race" }, [category(0, { priceStroops: 25n * SUSD })]), metadata());
const SOLD_OUT = entry(summary(2, { name: "Sold Out Sprint" }, [category(0, { quota: 100, enteredCount: 100 })]), metadata());
const CLOSED = entry(summary(3, { name: "Closed Classic", status: "Closed" }, [category(0)]), metadata());

function renderDrawer(props: Partial<ComponentProps<typeof FilterDrawer>> = {}) {
  const onApply = vi.fn();
  render(<FilterDrawer entries={[FREE, PAID]} filters={NO_FILTERS} order="soonest" onApply={onApply} {...props} />);
  return { onApply };
}

async function openDrawer(name: string | RegExp = "Filters") {
  await userEvent.click(screen.getByRole("button", { name }));
}

describe("FilterDrawer", () => {
  describe("positive", () => {
    it("counts the races an option leaves, then applies it", async () => {
      const { onApply } = renderDrawer();
      await openDrawer();

      await userEvent.click(await screen.findByRole("checkbox", { name: "Free" }));
      await userEvent.click(screen.getByRole("button", { name: "Show 1 race" }));

      expect(onApply).toHaveBeenCalledWith({ ...NO_FILTERS, prices: ["free"] }, "soonest");
    });

    it("sorts by nearest date first unless told otherwise", async () => {
      renderDrawer();
      await openDrawer();

      const sort = await screen.findByRole("group", { name: "Sort by" });
      expect(within(sort).getByRole("radio", { name: "Nearest date first" })).toBeChecked();
      expect(within(sort).getByRole("radio", { name: "Furthest date first" })).not.toBeChecked();
      // The legend already names the group; a second name on the radios' own
      // container would be read out twice.
      expect(within(sort).getByRole("radiogroup")).not.toHaveAttribute("aria-label");
    });

    it("applies the date order", async () => {
      const { onApply } = renderDrawer();
      await openDrawer();

      await userEvent.click(await screen.findByRole("radio", { name: "Furthest date first" }));
      await userEvent.click(screen.getByRole("button", { name: "Show 2 races" }));

      expect(onApply).toHaveBeenCalledWith(NO_FILTERS, "latest");
    });

    it("hides full and closed races, counting what is left", async () => {
      const { onApply } = renderDrawer({ entries: [FREE, PAID, SOLD_OUT, CLOSED] });
      await openDrawer();
      expect(await screen.findByRole("button", { name: "Show 4 races" })).toBeInTheDocument();

      const availability = screen.getByRole("group", { name: "Availability" });
      await userEvent.click(within(availability).getByRole("checkbox", { name: "Hide full and closed races" }));
      await userEvent.click(screen.getByRole("button", { name: "Show 2 races" }));

      expect(onApply).toHaveBeenCalledWith({ ...NO_FILTERS, availableOnly: true }, "soonest");
    });

    it("says how many filters are applied on the button", () => {
      renderDrawer({ filters: { ...NO_FILTERS, prices: ["free"], availableOnly: true } });

      expect(screen.getByRole("button", { name: "Filters, 2 applied" })).toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("discards changes that were not applied", async () => {
      const { onApply } = renderDrawer();
      await openDrawer();
      await userEvent.click(await screen.findByRole("checkbox", { name: "Free" }));
      await userEvent.click(screen.getByRole("radio", { name: "Furthest date first" }));

      await userEvent.keyboard("{Escape}");
      await openDrawer();

      expect(onApply).not.toHaveBeenCalled();
      expect(await screen.findByRole("checkbox", { name: "Free" })).not.toBeChecked();
      expect(screen.getByRole("radio", { name: "Nearest date first" })).toBeChecked();
    });

    it("clears every option and the sort at once", async () => {
      const { onApply } = renderDrawer({
        filters: { ...NO_FILTERS, prices: ["free"], availableOnly: true },
        order: "latest",
      });
      await openDrawer("Filters, 2 applied");
      expect(await screen.findByRole("checkbox", { name: "Free" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Hide full and closed races" })).toBeChecked();
      expect(screen.getByRole("radio", { name: "Furthest date first" })).toBeChecked();

      await userEvent.click(screen.getByRole("button", { name: "Clear all" }));

      expect(screen.getByRole("checkbox", { name: "Free" })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Hide full and closed races" })).not.toBeChecked();
      expect(screen.getByRole("radio", { name: "Nearest date first" })).toBeChecked();
      await userEvent.click(screen.getByRole("button", { name: "Show 2 races" }));
      expect(onApply).toHaveBeenCalledWith(NO_FILTERS, "soonest");
    });

    it("offers no location choice, even when races have one", async () => {
      // FREE and PAID both carry DI Yogyakarta. The place is chosen in the
      // page header, so the drawer must not offer a second, competing one.
      renderDrawer();
      await openDrawer();

      await screen.findByRole("checkbox", { name: "Free" });
      expect(screen.queryByText("Location")).not.toBeInTheDocument();
      expect(screen.queryByText(/DI Yogyakarta/)).not.toBeInTheDocument();
    });

    it("is titled Filter races, with no description text for a screen reader to point at", async () => {
      renderDrawer();
      await openDrawer();

      const dialog = await screen.findByRole("dialog", { name: "Filter races" });
      expect(dialog).not.toHaveAttribute("aria-describedby");
      expect(screen.queryByText(/Pick what matters/)).not.toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("says so when nothing fits", async () => {
      renderDrawer();
      await openDrawer();

      await userEvent.click(await screen.findByRole("checkbox", { name: "sUSD 100 and up" }));

      expect(screen.getByRole("button", { name: "Show 0 races" })).toBeInTheDocument();
    });

    it("leaves nothing when every race is full or closed", async () => {
      renderDrawer({ entries: [SOLD_OUT, CLOSED] });
      await openDrawer();

      await userEvent.click(await screen.findByRole("checkbox", { name: "Hide full and closed races" }));

      expect(screen.getByRole("button", { name: "Show 0 races" })).toBeInTheDocument();
    });
  });
});
