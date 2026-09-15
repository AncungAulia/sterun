import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FilterChips } from "@/modules/directory/component/FilterChips";
import { NO_FILTERS } from "@/modules/directory/filters";

describe("FilterChips", () => {
  it("removes one filter from its chip", async () => {
    const onChange = vi.fn();
    const filters = { ...NO_FILTERS, prices: ["free" as const], availableOnly: true };
    render(<FilterChips filters={filters} onChange={onChange} onClear={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Remove Free" }));

    expect(onChange).toHaveBeenCalledWith({ ...filters, prices: [] });
  });

  it("removes the availability filter from its chip", async () => {
    const onChange = vi.fn();
    const filters = { ...NO_FILTERS, prices: ["free" as const], availableOnly: true };
    render(<FilterChips filters={filters} onChange={onChange} onClear={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Remove Hide full and closed races" }));

    expect(onChange).toHaveBeenCalledWith({ ...filters, availableOnly: false });
  });

  it("clears them all", async () => {
    const onClear = vi.fn();
    render(<FilterChips filters={{ ...NO_FILTERS, availableOnly: true }} onChange={vi.fn()} onClear={onClear} />);

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(onClear).toHaveBeenCalled();
  });

  it("renders nothing when no filter is applied", () => {
    const { container } = render(<FilterChips filters={NO_FILTERS} onChange={vi.fn()} onClear={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });
});
