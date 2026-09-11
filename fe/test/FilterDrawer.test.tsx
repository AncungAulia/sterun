import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { FilterDrawer } from "@/modules/directory/component/FilterDrawer";
import { NO_FILTERS } from "@/modules/directory/filters";

import { SUSD, category, entry, metadata, summary } from "./fixtures/directory";

const FREE = entry(summary(0, { name: "Free Fun Run" }, [category(0, { priceStroops: 0n })]), metadata());
const PAID = entry(summary(1, { name: "Paid Road Race" }, [category(0, { priceStroops: 25n * SUSD })]), metadata());
const JAKARTA = entry(
  summary(2, {}, [category(0)]),
  metadata({ location: { name: "GBK", city: "Jakarta Pusat", province: "DKI Jakarta", country: "Indonesia", countryCode: "ID" } }),
);

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

    it("lists only provinces that have races, with how many", async () => {
      renderDrawer({ entries: [FREE, PAID, JAKARTA] });
      await openDrawer();

      expect(await screen.findByRole("checkbox", { name: "DI Yogyakarta (2)" })).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: "DKI Jakarta (1)" })).toBeInTheDocument();
    });

    it("applies the date order", async () => {
      const { onApply } = renderDrawer();
      await openDrawer();

      await userEvent.click(await screen.findByRole("radio", { name: "Latest first" }));
      await userEvent.click(screen.getByRole("button", { name: "Show 2 races" }));

      expect(onApply).toHaveBeenCalledWith(NO_FILTERS, "latest");
    });

    it("says how many filters are applied on the button", () => {
      renderDrawer({ filters: { ...NO_FILTERS, prices: ["free"], openOnly: true } });

      expect(screen.getByRole("button", { name: "Filters, 2 applied" })).toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("discards changes that were not applied", async () => {
      const { onApply } = renderDrawer();
      await openDrawer();
      await userEvent.click(await screen.findByRole("checkbox", { name: "Free" }));

      await userEvent.keyboard("{Escape}");
      await openDrawer();

      expect(onApply).not.toHaveBeenCalled();
      expect(await screen.findByRole("checkbox", { name: "Free" })).not.toBeChecked();
    });

    it("clears every option at once", async () => {
      renderDrawer({ filters: { ...NO_FILTERS, prices: ["free"] } });
      await openDrawer("Filters, 1 applied");
      expect(await screen.findByRole("checkbox", { name: "Free" })).toBeChecked();

      await userEvent.click(screen.getByRole("button", { name: "Clear all" }));

      expect(screen.getByRole("checkbox", { name: "Free" })).not.toBeChecked();
      expect(screen.getByRole("button", { name: "Show 2 races" })).toBeInTheDocument();
    });

    it("hides the location group when no race has a location", async () => {
      renderDrawer({ entries: [entry(summary(3, {}, [category(0)]), null)] });
      await openDrawer();

      await screen.findByRole("checkbox", { name: "Free" });
      expect(screen.queryByText("Location")).not.toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("says so when nothing fits", async () => {
      renderDrawer();
      await openDrawer();

      await userEvent.click(await screen.findByRole("checkbox", { name: "sUSD 100 and up" }));

      expect(screen.getByRole("button", { name: "Show 0 races" })).toBeInTheDocument();
    });
  });
});
